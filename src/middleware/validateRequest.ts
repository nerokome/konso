import type { RequestHandler } from "express";
import { validationResult } from "express-validator";

export const validateRequest: RequestHandler = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ error: "Request validation failed", details: errors.array() });
    return;
  }
  next();
};
