import { Router } from "express";
import { OrganisationRole } from "@prisma/client";
import { summary } from "../controllers/dashboardController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { requireOrganisationRole } from "../middleware/permissions.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, requireOrganisationRole(Object.values(OrganisationRole)));
dashboardRouter.get("/summary", asyncHandler(summary));
