import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { currentUser, login, register } from "../controllers/authController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { loginSchema, registerSchema } from "../validations/auth/auth.validation.js";

export const authRouter = Router();

authRouter.post("/register", registerSchema(), validateRequest, asyncHandler(register));
authRouter.post("/login", loginSchema(), validateRequest, asyncHandler(login));
authRouter.get("/me", requireAuth, asyncHandler(currentUser));
