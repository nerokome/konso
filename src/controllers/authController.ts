import type { RequestHandler } from "express";
import { HttpError } from "../middleware/errors.js";
import * as auth from "../services/authService.js";

export const register: RequestHandler = async (req, res) => {
  const credentials = req.body as { email: string; password: string };
  const result = await auth.registerUser(credentials.email, credentials.password);
  res.status(201).json(result);
};

export const login: RequestHandler = async (req, res) => {
  const credentials = req.body as { email: string; password: string };
  const result = await auth.loginUser(credentials.email, credentials.password);
  if (!result) throw new HttpError(401, "Invalid email or password");
  res.json(result);
};

export const refresh: RequestHandler = async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  const result = await auth.refreshUserSession(refreshToken);
  if (!result) throw new HttpError(401, "Invalid or expired refresh token");
  res.json(result);
};

export const logout: RequestHandler = async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  await auth.revokeRefreshToken(refreshToken);
  res.json({ status: "logged out" });
};

export const updateProfile: RequestHandler = async (req, res) => {
  const profile = req.body as { firstName?: string; lastName?: string; avatarUrl?: string };
  res.json({ user: await auth.updateCurrentUser(req.auth!.userId, profile) });
};

export const changePassword: RequestHandler = async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  await auth.changePassword(req.auth!.userId, currentPassword, newPassword);
  res.json({ status: "password changed" });
};

export const currentUser: RequestHandler = async (req, res) => {
  const result = await auth.getCurrentUser(req.auth!.userId);
  if (!result) throw new HttpError(404, "User not found");
  res.json(result);
};
