import type { RequestHandler } from "express";
import { DocumentCategory } from "@prisma/client";
import { HttpError } from "../middleware/errors.js";
import * as documents from "../services/documentService.js";

export const requireVerifiedOrganisation: RequestHandler = async (req, _res, next) => {
  await documents.requireVerifiedOrganisation(req.organisationId!);
  next();
};

export const uploadDocument: RequestHandler = async (req, res) => {
  if (!Buffer.isBuffer(req.body)) throw new HttpError(400, "Request body must contain raw file bytes");
  const mimeType = req.header("x-file-content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const document = await documents.uploadDocument({
    organisationId: req.organisationId!,
    userId: req.auth!.userId,
    fileName: req.header("x-file-name") ?? "",
    mimeType,
    content: req.body,
    title: req.header("x-document-title") ?? undefined,
    category: (req.header("x-document-category") as DocumentCategory | undefined),
    department: req.header("x-document-department") ?? undefined,
    description: req.header("x-document-description") ?? undefined,
    tags: req.header("x-document-tags")?.split(",").map((tag) => tag.trim()).filter(Boolean),
    discoverable: req.header("x-document-discoverable") === "true",
  });
  res.status(201).json({ document });
};

export const listDocuments: RequestHandler = async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  res.json(await documents.listDocuments(req.organisationId!, {
    limit: Number.isInteger(limit) && limit > 0 ? limit : 50,
    cursor: req.query.cursor as string | undefined,
    q: req.query.q as string | undefined,
    sort: req.query.sort === "asc" ? "asc" : "desc",
  }));
};

export const downloadDocument: RequestHandler = async (req, res) => {
  const result = await documents.downloadDocument({
    documentId: req.params.documentId!,
    organisationId: req.organisationId!,
    userId: req.auth!.userId,
  });
  const disposition = req.query.disposition === "inline" ? "inline" : "attachment";
  const asciiName = result.document.originalName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encodedName = encodeURIComponent(result.document.originalName).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  res.type(result.document.mimeType)
    .setHeader("Content-Disposition", `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodedName}`)
    .send(result.content);
};

export const requestAccess: RequestHandler = async (req, res) => {
  const { reason, expiresAt } = req.body as { reason: string; expiresAt: Date };
  const request = await documents.requestDocumentAccess({
    documentId: req.params.documentId!,
    organisationId: req.organisationId!,
    userId: req.auth!.userId,
    reason,
    expiresAt,
  });
  res.status(201).json({ request });
};

export const listAccessRequests: RequestHandler = async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 100);
  res.json(await documents.listAccessRequests(req.organisationId!, req.auth!.userId, {
    limit: Number.isInteger(limit) && limit > 0 ? limit : 50,
    cursor: req.query.cursor as string | undefined,
    q: req.query.q as string | undefined,
    sort: req.query.sort === "asc" ? "asc" : "desc",
  }));
};

export const listSharedDocuments: RequestHandler = async (req, res) => {
  res.json({ documents: await documents.listSharedDocuments(req.organisationId!, req.auth!.userId) });
};

export const cancelAccessRequest: RequestHandler = async (req, res) => {
  const request = await documents.cancelAccessRequest({
    requestId: req.params.requestId!, organisationId: req.organisationId!, userId: req.auth!.userId,
  });
  res.json({ request });
};

export const decideAccessRequest: RequestHandler = async (req, res) => {
  const { decision, note } = req.body as { decision: "APPROVED" | "REJECTED"; note?: string };
  const request = await documents.decideAccessRequest({
    requestId: req.params.requestId!,
    userId: req.auth!.userId,
    decision,
    note,
  });
  res.json({ request });
};

export const revokeAccess: RequestHandler = async (req, res) => {
  await documents.revokeAccess({
    documentId: req.params.documentId!,
    organisationId: req.params.organisationId!,
    userId: req.auth!.userId,
  });
  res.json({ status: "revoked" });
};

export const deleteDocument: RequestHandler = async (req, res) => {
  await documents.deleteDocument({ documentId: req.params.documentId!, userId: req.auth!.userId });
  res.json({ status: "deleted" });
};
