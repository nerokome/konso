import type { RequestHandler } from "express";
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
  });
  res.status(201).json({ document });
};

export const listDocuments: RequestHandler = async (req, res) => {
  res.json({ documents: await documents.listDocuments(req.organisationId!) });
};

export const downloadDocument: RequestHandler = async (req, res) => {
  const result = await documents.downloadDocument({
    documentId: req.params.documentId!,
    organisationId: req.organisationId!,
    userId: req.auth!.userId,
  });
  res.type(result.document.mimeType).attachment(result.document.originalName).send(result.content);
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
  res.json({ requests: await documents.listAccessRequests(req.organisationId!, req.auth!.userId) });
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
