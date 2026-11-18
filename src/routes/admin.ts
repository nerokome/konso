import { Router } from "express";
import { PlatformRole } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePlatformRole } from "../middleware/permissions.js";
import { validateRequest } from "../middleware/validateRequest.js";
import * as controller from "../controllers/adminController.js";
import { adminAuditSchema, adminIdSchema, adminOrganisationListSchema, adminUsersSchema, updatePlatformRoleSchema } from "../validations/admin.validation.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requirePlatformRole([PlatformRole.ADMIN, PlatformRole.VERIFIER]));
adminRouter.get("/organisations", adminOrganisationListSchema(), validateRequest, asyncHandler(controller.listOrganisations));
adminRouter.get("/organisations/:id", adminIdSchema(), validateRequest, asyncHandler(controller.getOrganisation));
adminRouter.get("/stats", asyncHandler(controller.stats));
adminRouter.get("/audit", adminAuditSchema(), validateRequest, asyncHandler(controller.audit));
adminRouter.get("/users", requirePlatformRole([PlatformRole.ADMIN]), adminUsersSchema(), validateRequest, asyncHandler(controller.users));
adminRouter.patch("/users/:id/role", requirePlatformRole([PlatformRole.ADMIN]), updatePlatformRoleSchema(), validateRequest, asyncHandler(controller.updateRole));
