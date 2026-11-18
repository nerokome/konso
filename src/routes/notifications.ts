import { Router } from "express";
import { body, query } from "express-validator";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { validateRequest } from "../middleware/validateRequest.js";
import * as controller from "../controllers/notificationsController.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get("/", query("limit").optional().isInt({ min: 1, max: 100 }), query("cursor").optional().isUUID(), query("unreadOnly").optional().isBoolean(), validateRequest, asyncHandler(controller.list));
notificationsRouter.patch("/read", body("ids").isArray({ min: 1, max: 100 }), body("ids.*").isUUID(), validateRequest, asyncHandler(controller.markRead));
