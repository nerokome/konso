import type { RequestHandler } from "express";
import { listOrganisationAudit } from "../services/audit.js";

export const listAudit: RequestHandler = async (req, res) => {
  const limitValue = Number(req.query.limit ?? 100);
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 100;
  const events = await listOrganisationAudit(req.organisationId!, limit);
  res.json({ events });
};
