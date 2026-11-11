import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AccessRequestStatus, OrganisationRole, OrganisationStatus } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";
import { membershipFor } from "../middleware/permissions.js";
import { recordAudit } from "./audit.js";

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
  createdAt: Date;
};

export async function uploadDocument(input: { organisationId: string; userId: string; fileName: string; mimeType: string; content: Buffer }) {
  await requireVerifiedOrganisation(input.organisationId);
  const originalName = path.basename(input.fileName).replace(/[\r\n\0]/g, "").slice(0, 255);
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
      },
      select: { id: true, organisationId: true, originalName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
    });
  } catch (error) {
    await unlink(path.join(uploadRoot, storageKey)).catch(() => undefined);
    throw error;
  }
  await recordAudit({ actorUserId: input.userId, organisationId: input.organisationId, documentId: document.id, action: "DOCUMENT_UPLOADED" });
  return document;
}

export async function listDocuments(organisationId: string) {
  return prisma.document.findMany({
    where: { organisationId },
    select: { id: true, originalName: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function downloadDocument(input: { documentId: string; organisationId: string; userId: string }) {
  await requireVerifiedOrganisation(input.organisationId);
  const document = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!document) throw new HttpError(404, "Document not found");
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
    select: { id: true, organisationId: true, organisation: { select: { status: true } } },
  });
  if (!document) throw new HttpError(404, "Document not found");
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
  return request;
}

export async function listAccessRequests(organisationId: string, userId: string) {
  const membership = await membershipFor(userId, organisationId);
  if (!membership) throw new HttpError(403, "You are not a member of that organisation");
  return prisma.accessRequest.findMany({
    where: { OR: [{ requesterOrganisationId: organisationId }, { document: { organisationId } }] },
    include: {
      document: { select: { id: true, originalName: true, organisationId: true } },
      requesterOrganisation: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function decideAccessRequest(input: {
  requestId: string; userId: string; decision: "APPROVED" | "REJECTED"; note?: string;
}) {
  const request = await prisma.accessRequest.findUnique({ where: { id: input.requestId }, include: { document: true } });
  if (!request) throw new HttpError(404, "Access request not found");
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
    return tx.accessRequest.findUniqueOrThrow({ where: { id: request.id } });
  });
  await recordAudit({
    actorUserId: input.userId,
    organisationId: request.document.organisationId,
    documentId: request.documentId,
    requestId: request.id,
    action: `ACCESS_REQUEST_${input.decision}`,
    details: { requesterOrganisationId: request.requesterOrganisationId },
  });
  return updated;
}

export async function revokeAccess(input: { documentId: string; organisationId: string; userId: string }) {
  const document = await prisma.document.findUnique({ where: { id: input.documentId } });
  if (!document) throw new HttpError(404, "Document not found");
  const membership = await membershipFor(input.userId, document.organisationId);
  if (!membership || !approverRoles.includes(membership.role)) {
    throw new HttpError(403, "Only the document owner organisation's admins can revoke access");
  }
  const grant = await prisma.documentAccess.findUnique({
    where: { documentId_organisationId: { documentId: document.id, organisationId: input.organisationId } },
  });
  if (!grant || grant.revokedAt || grant.expiresAt <= new Date()) throw new HttpError(404, "Active access grant not found");
  await prisma.documentAccess.update({ where: { id: grant.id }, data: { revokedAt: new Date(), revokedById: input.userId } });
  await recordAudit({
    actorUserId: input.userId,
    organisationId: document.organisationId,
    documentId: document.id,
    action: "DOCUMENT_ACCESS_REVOKED",
    details: { organisationId: input.organisationId },
  });
}

export async function requireVerifiedOrganisation(organisationId: string): Promise<void> {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { status: true } });
  if (!organisation || organisation.status !== OrganisationStatus.VERIFIED) {
    throw new HttpError(403, "Organisation must be verified for document operations");
  }
}
