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

export const currentUser: RequestHandler = async (req, res) => {
  const result = await auth.getCurrentUser(req.auth!.userId);
  if (!result) throw new HttpError(404, "User not found");
  res.json(result);
};
