import type { RequestHandler } from "express";
import { isDatabaseReady } from "../services/healthService.js";

export const health: RequestHandler = (_req, res) => {
  res.json({ status: "ok" });
};

export const readiness: RequestHandler = async (_req, res) => {
  if (!(await isDatabaseReady())) {
    res.status(503).json({ status: "unavailable" });
    return;
  }
  res.json({ status: "ready" });
};
