import express, { Router } from "express";
import { OrganisationRole } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOrganisationRole } from "../middleware/permissions.js";
import * as controller from "../controllers/documentsController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { accessDecisionSchema, accessRequestIdSchema, accessRequestSchema, documentDownloadSchema, documentIdSchema, documentListSchema, documentUploadSchema } from "../validations/documents/document.validation.js";

const readRoles = Object.values(OrganisationRole);
const writeRoles = [OrganisationRole.OWNER, OrganisationRole.ADMIN, OrganisationRole.MEMBER];

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

documentsRouter.post(
  "/",
  requireOrganisationRole(writeRoles),
  asyncHandler(controller.requireVerifiedOrganisation),
  express.raw({ type: "application/octet-stream", limit: "10mb" }),
  documentUploadSchema(), validateRequest,
  asyncHandler(controller.uploadDocument),
);
documentsRouter.get("/", requireOrganisationRole(readRoles), documentListSchema(), validateRequest, asyncHandler(controller.listDocuments));
documentsRouter.get("/access-requests", requireOrganisationRole(readRoles), documentListSchema(), validateRequest, asyncHandler(controller.listAccessRequests));
documentsRouter.get("/shared", requireOrganisationRole(readRoles), asyncHandler(controller.listSharedDocuments));
documentsRouter.delete("/access-requests/:requestId", requireOrganisationRole(readRoles), accessRequestIdSchema(), validateRequest, asyncHandler(controller.cancelAccessRequest));
documentsRouter.delete("/:documentId", requireOrganisationRole([OrganisationRole.OWNER, OrganisationRole.ADMIN]), documentIdSchema(), validateRequest, asyncHandler(controller.deleteDocument));
documentsRouter.patch("/access-requests/:requestId/decision", accessDecisionSchema(), validateRequest, asyncHandler(controller.decideAccessRequest));
documentsRouter.get("/:documentId/content", requireOrganisationRole(readRoles), documentDownloadSchema(), validateRequest, asyncHandler(controller.downloadDocument));
documentsRouter.post("/:documentId/access-requests", requireOrganisationRole(writeRoles), accessRequestSchema(), validateRequest, asyncHandler(controller.requestAccess));
documentsRouter.delete("/:documentId/access/:organisationId", asyncHandler(controller.revokeAccess));
