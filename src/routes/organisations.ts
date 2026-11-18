import { Router } from "express";
import { OrganisationRole, PlatformRole } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOrganisationRole, requirePlatformRole } from "../middleware/permissions.js";
import * as controller from "../controllers/organisationsController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { addMemberSchema, createInvitationSchema, createOrganisationSchema, memberIdsSchema, memberRoleSchema, organisationIdSchema, resubmitVerificationSchema, updateOrganisationSchema, verificationSchema } from "../validations/organisations/organisation.validation.js";

export const organisationsRouter = Router();
organisationsRouter.use(requireAuth);

organisationsRouter.post("/", createOrganisationSchema(), validateRequest, asyncHandler(controller.createOrganisation));
organisationsRouter.get("/", asyncHandler(controller.listOrganisations));
organisationsRouter.get("/verified", asyncHandler(controller.listVerifiedOrganisations));
organisationsRouter.get("/:organisationId/documents/catalog", organisationIdSchema(), validateRequest, asyncHandler(controller.listDocumentCatalog));
organisationsRouter.patch("/:organisationId", requireOrganisationRole([OrganisationRole.OWNER]), updateOrganisationSchema(), validateRequest, asyncHandler(controller.updateOrganisation));
organisationsRouter.post("/:organisationId/verification/resubmit", requireOrganisationRole([OrganisationRole.OWNER]), resubmitVerificationSchema(), validateRequest, asyncHandler(controller.resubmitVerification));
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
organisationsRouter.post(
  "/:organisationId/invitations",
  requireOrganisationRole([OrganisationRole.OWNER, OrganisationRole.ADMIN]),
  createInvitationSchema(), validateRequest,
  asyncHandler(controller.createInvitation),
);
organisationsRouter.get(
  "/:organisationId/members",
  requireOrganisationRole(Object.values(OrganisationRole)),
  organisationIdSchema(), validateRequest,
  asyncHandler(controller.listMembers),
);
organisationsRouter.patch(
  "/:organisationId/members/:userId",
  requireOrganisationRole([OrganisationRole.OWNER, OrganisationRole.ADMIN]),
  memberRoleSchema(), validateRequest,
  asyncHandler(controller.changeMemberRole),
);
organisationsRouter.delete(
  "/:organisationId/members/:userId",
  requireOrganisationRole([OrganisationRole.OWNER, OrganisationRole.ADMIN]),
  memberIdsSchema(), validateRequest,
  asyncHandler(controller.removeMember),
);
organisationsRouter.patch(
  "/:organisationId/verification",
  requirePlatformRole([PlatformRole.ADMIN, PlatformRole.VERIFIER]),
  verificationSchema(), validateRequest,
  asyncHandler(controller.updateVerification),
);
