import { Router } from "express";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { requireAuth } from "../middleware/auth.js";
import { changePassword, currentUser, login, logout, refresh, register, updateProfile } from "../controllers/authController.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { changePasswordSchema, loginSchema, refreshTokenSchema, registerSchema, updateProfileSchema } from "../validations/auth/auth.validation.js";
import { authRateLimit } from "../middleware/authRateLimit.js";

export const authRouter = Router();

authRouter.post("/register", authRateLimit, registerSchema(), validateRequest, asyncHandler(register));
authRouter.post("/login", authRateLimit, loginSchema(), validateRequest, asyncHandler(login));
authRouter.post("/refresh", refreshTokenSchema(), validateRequest, asyncHandler(refresh));
authRouter.post("/logout", refreshTokenSchema(), validateRequest, asyncHandler(logout));
authRouter.get("/me", requireAuth, asyncHandler(currentUser));
authRouter.patch("/me", requireAuth, updateProfileSchema(), validateRequest, asyncHandler(updateProfile));
authRouter.post("/change-password", requireAuth, changePasswordSchema(), validateRequest, asyncHandler(changePassword));
