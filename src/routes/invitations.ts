import { Router } from "express";
import { param } from "express-validator";
import { accept } from "../controllers/invitationsController.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validateRequest.js";

export const invitationsRouter = Router();
invitationsRouter.post("/:token/accept", requireAuth, param("token").matches(/^[A-Za-z0-9_-]{40,60}$/).withMessage("Invalid invitation token"), validateRequest, asyncHandler(accept));
