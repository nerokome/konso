import { Router } from "express";
import { OrganisationRole } from "@prisma/client";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOrganisationRole } from "../middleware/permissions.js";
import { listAudit } from "../controllers/auditController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { auditQuerySchema } from "../validations/audit/audit.validation.js";

export const auditRouter = Router();
auditRouter.use(requireAuth);
auditRouter.get("/", requireOrganisationRole(Object.values(OrganisationRole)), auditQuerySchema(), validateRequest, asyncHandler(listAudit));
