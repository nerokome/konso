import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AccessRequestStatus, DocumentCategory, OrganisationRole, OrganisationStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";
import { membershipFor } from "../middleware/permissions.js";
import { recordAudit } from "./audit.js";
import { notifyOrganisation, notifyUsers } from "./notificationService.js";
import { dispatchWebhookEvent } from "./webhookService.js";

const uploadRoot = path.resolve(env.UPLOAD_DIR);
const allowedMimeTypes = new Set(["application/pdf", "image/jpeg", "image/png", "text/plain"]);
const approverRoles: OrganisationRole[] = [OrganisationRole.OWNER, OrganisationRole.ADMIN];

type UploadedDocument = {
  id: string;
  organisationId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  title: string | null;
  category: DocumentCategory | null;
  department: string | null;
  description: string | null;
  tags: string[];
  discoverable: boolean;
  createdAt: Date;
};

export async function uploadDocument(input: {
  organisationId: string; userId: string; fileName: string; mimeType: string; content: Buffer;
  title?: string; category?: DocumentCategory; department?: string; description?: string; tags?: string[]; discoverable?: boolean;
}) {
  await requireVerifiedOrganisation(input.organisationId);
  let decodedFileName = input.fileName;
  try { decodedFileName = decodeURIComponent(input.fileName); } catch { /* Keep the original header when it is not valid percent encoding. */ }
  const originalName = path.basename(decodedFileName).replace(/[\r\n\0]/g, "").slice(0, 255);
  if (!input.content.length || !allowedMimeTypes.has(input.mimeType) || !originalName) {
    throw new HttpError(400, "Send non-empty octet-stream bytes with x-file-name and x-file-content-type (PDF, PNG, JPEG, or plain text)");
  }

  const storageKey = randomUUID();
  await mkdir(uploadRoot, { recursive: true });
  await writeFile(path.join(uploadRoot, storageKey), input.content, { flag: "wx" });
  let document: UploadedDocument;
  try {
    document = await prisma.document.create({
      data: {
        organisationId: input.organisationId,
        uploadedById: input.userId,
        originalName,
        storageKey,
        mimeType: input.mimeType,
        sizeBytes: input.content.length,
        sha256: createHash("sha256").update(input.content).digest("hex"),
        title: input.title || originalName,
        category: input.category,
        department: input.department,
        description: input.description,
        tags: input.tags ?? [],
        discoverable: input.discoverable ?? false,
      },
      select: { id: true, organisationId: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, title: true, category: true, department: true, description: true, tags: true, discoverable: true, createdAt: true },
    });
  } catch (error) {
    await unlink(path.join(uploadRoot, storageKey)).catch(() => undefined);
    throw error;
  }
  await recordAudit({ actorUserId: input.userId, organisationId: input.organisationId, documentId: document.id, action: "DOCUMENT_UPLOADED" });
  return document;
}

export async function listDocuments(organisationId: string, options: { limit: number; cursor?: string; q?: string; sort: "asc" | "desc" }) {
  const rows = await prisma.document.findMany({
    where: { organisationId, deletedAt: null, ...(options.q ? { OR: [
      { originalName: { contains: options.q, mode: "insensitive" } },
      { title: { contains: options.q, mode: "insensitive" } },
      { department: { contains: options.q, mode: "insensitive" } },
    ] } : {}) },
    take: options.limit + 1, ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: { id: true, originalName: true, title: true, category: true, department: true, description: true, tags: true, discoverable: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: [{ createdAt: options.sort }, { id: options.sort }],
  });
  const hasMore = rows.length > options.limit;
  const documents = rows.slice(0, options.limit);
  return { documents, ...(hasMore ? { nextCursor: documents.at(-1)?.id } : {}) };
}

export async function downloadDocument(input: { documentId: string; organisationId: string; userId: string }) {
  await requireVerifiedOrganisation(input.organisationId);
  const document = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!document || document.deletedAt) throw new HttpError(404, "Document not found");
  const ownsDocument = document.organisationId === input.organisationId;
  if (!ownsDocument) {
    const grant = await prisma.documentAccess.findFirst({
      where: {
        documentId: document.id,
        organisationId: input.organisationId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!grant) throw new HttpError(403, "No active access grant for this document");
  }
  const content = await readFile(path.join(uploadRoot, document.storageKey));
  await recordAudit({ actorUserId: input.userId, organisationId: input.organisationId, documentId: document.id, action: "DOCUMENT_DOWNLOADED" });
  return { document, content };
}

export async function requestDocumentAccess(input: {
  documentId: string;
  organisationId: string;
  userId: string;
  reason: string;
  expiresAt: Date;
}) {
  await requireVerifiedOrganisation(input.organisationId);
  const now = new Date();
  if (input.reason.length < 5 || input.reason.length > 1000 || Number.isNaN(input.expiresAt.getTime()) ||
      input.expiresAt <= now || input.expiresAt.getTime() > now.getTime() + 365 * 24 * 60 * 60 * 1000) {
    throw new HttpError(400, "Provide a reason (5-1000 characters) and an expiry within the next 365 days");
  }
  const document = await prisma.document.findUnique({
    where: { id: input.documentId },
    select: { id: true, organisationId: true, deletedAt: true, organisation: { select: { status: true } } },
  });
  if (!document || document.deletedAt) throw new HttpError(404, "Document not found");
  if (document.organisation.status !== OrganisationStatus.VERIFIED) throw new HttpError(403, "Document owner organisation is not verified");
  if (document.organisationId === input.organisationId) throw new HttpError(400, "Your organisation already owns this document");
  const currentAccess = await prisma.documentAccess.findFirst({
    where: { documentId: document.id, organisationId: input.organisationId, revokedAt: null, expiresAt: { gt: now } },
  });
  if (currentAccess) throw new HttpError(409, "Your organisation already has active access");
  const pending = await prisma.accessRequest.findFirst({
    where: { documentId: document.id, requesterOrganisationId: input.organisationId, status: AccessRequestStatus.PENDING },
  });
  if (pending) throw new HttpError(409, "An access request is already pending");
  const request = await prisma.accessRequest.create({
    data: {
      documentId: document.id,
      requesterOrganisationId: input.organisationId,
      requesterUserId: input.userId,
      reason: input.reason,
      requestedExpiresAt: input.expiresAt,
    },
  });
  await recordAudit({ actorUserId: input.userId, organisationId: input.organisationId, documentId: document.id, requestId: request.id, action: "ACCESS_REQUESTED" });
  await notifyOrganisation({ organisationId: document.organisationId, eventKey: `access-request:${request.id}`, type: "ACCESS_REQUEST_CREATED", title: "New document access request", message: "An organisation requested access to a document.", data: { requestId: request.id, documentId: document.id } });
  void dispatchWebhookEvent({ organisationId: document.organisationId, event: "ACCESS_REQUEST_CREATED", data: { requestId: request.id, documentId: document.id, requesterOrganisationId: input.organisationId } });
  return request;
}

export async function listAccessRequests(organisationId: string, userId: string, options: { limit: number; cursor?: string; q?: string; sort: "asc" | "desc" }) {
  const membership = await membershipFor(userId, organisationId);
  if (!membership) throw new HttpError(403, "You are not a member of that organisation");
  const rows = await prisma.accessRequest.findMany({
    where: {
      OR: [{ requesterOrganisationId: organisationId }, { document: { organisationId } }],
      document: { deletedAt: null, ...(options.q ? { OR: [
        { title: { contains: options.q, mode: "insensitive" } },
        { originalName: { contains: options.q, mode: "insensitive" } },
      ] } : {}) },
    },
    take: options.limit + 1, ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: {
      document: { select: { id: true, originalName: true, organisationId: true } },
      requesterOrganisation: { select: { id: true, name: true } },
      accessGrant: { select: { revokedAt: true, expiresAt: true } },
    },
    orderBy: [{ createdAt: options.sort }, { id: options.sort }],
  });
  const hasMore = rows.length > options.limit;
  const requests = rows.slice(0, options.limit);
  const now = new Date();
  const data = requests.map(({ accessGrant, ...request }) => ({
    ...request,
    grant: accessGrant ? {
      status: accessGrant.revokedAt ? "REVOKED" : accessGrant.expiresAt <= now ? "EXPIRED" : "ACTIVE",
      revokedAt: accessGrant.revokedAt,
      expiresAt: accessGrant.expiresAt,
    } : null,
  }));
  return { requests: data, ...(hasMore ? { nextCursor: requests.at(-1)?.id } : {}) };
}

export async function listSharedDocuments(organisationId: string, userId: string) {
  const membership = await membershipFor(userId, organisationId);
  if (!membership) throw new HttpError(403, "You are not a member of that organisation");
  const grants = await prisma.documentAccess.findMany({
    where: { organisationId, revokedAt: null, expiresAt: { gt: new Date() }, document: { deletedAt: null } },
    include: { document: { select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true, organisation: { select: { id: true, name: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return grants.map(({ document, expiresAt }) => ({ ...document, expiresAt }));
}

export async function cancelAccessRequest(input: { requestId: string; organisationId: string; userId: string }) {
  const request = await prisma.accessRequest.findUnique({ where: { id: input.requestId }, include: { document: { select: { deletedAt: true } } } });
  if (!request) throw new HttpError(404, "Access request not found");
  if (request.document.deletedAt) throw new HttpError(404, "Document not found");
  if (request.requesterOrganisationId !== input.organisationId) throw new HttpError(403, "You cannot cancel another organisation's request");
  const membership = await membershipFor(input.userId, input.organisationId);
  const canManageRequests = membership?.role === OrganisationRole.OWNER || membership?.role === OrganisationRole.ADMIN;
  if (request.requesterUserId !== input.userId && !canManageRequests) {
    throw new HttpError(403, "Only the requester or an organisation owner/admin can cancel this request");
  }
  if (request.status !== AccessRequestStatus.PENDING) throw new HttpError(409, "Only pending requests can be cancelled");
  const updated = await prisma.accessRequest.update({ where: { id: request.id }, data: { status: AccessRequestStatus.CANCELLED } });
  await recordAudit({ actorUserId: input.userId, organisationId: input.organisationId, documentId: request.documentId, requestId: request.id, action: "ACCESS_REQUEST_CANCELLED" });
  return updated;
}

export async function decideAccessRequest(input: {
  requestId: string; userId: string; decision: "APPROVED" | "REJECTED"; note?: string;
}) {
  const request = await prisma.accessRequest.findUnique({ where: { id: input.requestId }, include: { document: true } });
  if (!request) throw new HttpError(404, "Access request not found");
  if (request.document.deletedAt) throw new HttpError(404, "Document not found");
  const membership = await membershipFor(input.userId, request.document.organisationId);
  if (!membership || !approverRoles.includes(membership.role)) {
    throw new HttpError(403, "Only the document owner organisation's admins can decide requests");
  }
  if (request.status !== AccessRequestStatus.PENDING) throw new HttpError(409, "This request has already been decided");
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.accessRequest.updateMany({
      where: { id: request.id, status: AccessRequestStatus.PENDING },
      data: {
        status: input.decision,
        decidedAt: new Date(),
        decidedById: input.userId,
        decisionNote: input.note || null,
      },
    });
    if (!changed.count) throw new HttpError(409, "This request has already been decided");
    if (input.decision === "APPROVED") {
      await tx.documentAccess.upsert({
        where: { documentId_organisationId: { documentId: request.documentId, organisationId: request.requesterOrganisationId } },
        create: {
          documentId: request.documentId,
          organisationId: request.requesterOrganisationId,
          requestId: request.id,
          grantedById: input.userId,
          expiresAt: request.requestedExpiresAt,
        },
        update: {
          requestId: request.id,
          grantedById: input.userId,
          expiresAt: request.requestedExpiresAt,
          revokedAt: null,
          revokedById: null,
        },
      });
    }
    const updated = await tx.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: input.userId, organisationId: request.document.organisationId, documentId: request.documentId,
        requestId: request.id, action: `ACCESS_REQUEST_${input.decision}`,
        details: { requesterOrganisationId: request.requesterOrganisationId, decisionNote: input.note ?? null, previousStatus: request.status },
      },
    });
    return updated;
  });
  await notifyUsers([{ userId: request.requesterUserId, organisationId: request.requesterOrganisationId, eventKey: `access-decision:${updated.id}:${request.requesterUserId}`, type: "ACCESS_REQUEST_DECIDED", title: `Access request ${input.decision.toLowerCase()}`, message: input.note || `Your document access request was ${input.decision.toLowerCase()}.`, data: { requestId: updated.id, decision: input.decision } }]);
  void dispatchWebhookEvent({ organisationId: request.document.organisationId, event: "ACCESS_REQUEST_DECIDED", data: { requestId: updated.id, decision: input.decision, requesterOrganisationId: request.requesterOrganisationId } });
  return updated;
}

export async function revokeAccess(input: { documentId: string; organisationId: string; userId: string }) {
  const document = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!document || document.deletedAt) throw new HttpError(404, "Document not found");
  const membership = await membershipFor(input.userId, document.organisationId);
  if (!membership || !approverRoles.includes(membership.role)) {
    throw new HttpError(403, "Only the document owner organisation's admins can revoke access");
  }
  const grant = await prisma.documentAccess.findUnique({
    where: { documentId_organisationId: { documentId: document.id, organisationId: input.organisationId } },
  });
  if (!grant || grant.revokedAt || grant.expiresAt <= new Date()) throw new HttpError(404, "Active access grant not found");
  const revokedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.documentAccess.update({ where: { id: grant.id }, data: { revokedAt, revokedById: input.userId } });
    await tx.auditLog.create({
      data: { actorUserId: input.userId, organisationId: document.organisationId, documentId: document.id, action: "DOCUMENT_ACCESS_REVOKED", details: { organisationId: input.organisationId, revokedAt: revokedAt.toISOString() } },
    });
  });
}

export async function deleteDocument(input: { documentId: string; userId: string }) {
  const document = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!document || document.deletedAt) throw new HttpError(404, "Document not found");
  const membership = await membershipFor(input.userId, document.organisationId);
  if (!membership || !approverRoles.includes(membership.role)) throw new HttpError(403, "Only the document owner organisation's admins can delete documents");
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.documentAccess.updateMany({ where: { documentId: document.id, revokedAt: null }, data: { revokedAt: now, revokedById: input.userId } });
    await tx.document.update({ where: { id: document.id }, data: { deletedAt: now } });
    await tx.auditLog.create({ data: {
      actorUserId: input.userId, organisationId: document.organisationId, documentId: document.id,
      action: "DOCUMENT_DELETED", details: { revokedGrantsAt: now.toISOString() },
    } });
  });
}

export async function requireVerifiedOrganisation(organisationId: string): Promise<void> {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { status: true } });
  if (!organisation || organisation.status !== OrganisationStatus.VERIFIED) {
    throw new HttpError(403, "Organisation must be verified for document operations");
  }
}

export async function markExpiredGrants(): Promise<number> {
  const result = await prisma.documentAccess.updateMany({
    where: { expiredAt: null, revokedAt: null, expiresAt: { lte: new Date() } },
    data: { expiredAt: new Date() },
  });
  return result.count;
}

export async function notifyExpiringGrants(): Promise<number> {
  const now = new Date();
  const from = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const to = new Date(from.getTime() + 60 * 60 * 1000);
  const grants = await prisma.documentAccess.findMany({
    where: { revokedAt: null, expiredAt: null, expiresAt: { gte: from, lt: to } },
    include: { document: { select: { organisationId: true, title: true, originalName: true } }, organisation: { select: { id: true } }, request: { select: { requesterUserId: true } } },
  });
  for (const grant of grants) {
    const label = grant.document.title || grant.document.originalName;
    await notifyOrganisation({ organisationId: grant.document.organisationId, roles: [OrganisationRole.OWNER, OrganisationRole.ADMIN], eventKey: `grant-expiry-owner:${grant.id}`, type: "GRANT_EXPIRING", title: "Shared access expires soon", message: `Access to ${label} expires in seven days.`, data: { grantId: grant.id, expiresAt: grant.expiresAt.toISOString() } });
    if (grant.request?.requesterUserId) await notifyUsers([{ userId: grant.request.requesterUserId, organisationId: grant.organisationId, eventKey: `grant-expiry-requester:${grant.id}:${grant.request.requesterUserId}`, type: "GRANT_EXPIRING", title: "Shared access expires soon", message: `Your access to ${label} expires in seven days.`, data: { grantId: grant.id, expiresAt: grant.expiresAt.toISOString() } }]);
  }
  return grants.length;
}
