import type { RequestHandler } from "express";
import { getDashboardSummary } from "../services/dashboardService.js";

export const summary: RequestHandler = async (req, res) => {
  res.json(await getDashboardSummary(req.organisationId!));
};
