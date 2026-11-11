import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "./errors.js";

export const requireAuth: RequestHandler = (req, _res, next) => {
  const authorization = req.header("authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme !== "Bearer" || !token) {
    next(new HttpError(401, "Authentication required"));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === "string" || typeof payload.sub !== "string") {
      throw new Error("Invalid token payload");
    }
    req.auth = { userId: payload.sub };
    next();
  } catch {
    next(new HttpError(401, "Invalid or expired token"));
  }
};
