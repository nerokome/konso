import { Router } from "express";
import { OrganisationRole, PlatformRole } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOrganisationRole, requirePlatformRole } from "../middleware/permissions.js";
import * as controller from "../controllers/organisationsController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { addMemberSchema, createOrganisationSchema, organisationIdSchema, verificationSchema } from "../validations/organisations/organisation.validation.js";

export const organisationsRouter = Router();
organisationsRouter.use(requireAuth);

organisationsRouter.post("/", createOrganisationSchema(), validateRequest, asyncHandler(controller.createOrganisation));
organisationsRouter.get("/", asyncHandler(controller.listOrganisations));
organisationsRouter.get(
  "/verification/pending",
  requirePlatformRole([PlatformRole.ADMIN, PlatformRole.VERIFIER]),
  asyncHandler(controller.listPendingOrganisations),
);
organisationsRouter.get(
  "/:organisationId",
  requireOrganisationRole(Object.values(OrganisationRole)),
  organisationIdSchema(), validateRequest,
  asyncHandler(controller.getOrganisation),
);
organisationsRouter.post(
  "/:organisationId/members",
  requireOrganisationRole([OrganisationRole.OWNER, OrganisationRole.ADMIN]),
  addMemberSchema(), validateRequest,
  asyncHandler(controller.addMember),
);
organisationsRouter.patch(
  "/:organisationId/verification",
  requirePlatformRole([PlatformRole.ADMIN, PlatformRole.VERIFIER]),
  verificationSchema(), validateRequest,
  asyncHandler(controller.updateVerification),
);
