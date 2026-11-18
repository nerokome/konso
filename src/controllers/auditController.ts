import type { RequestHandler } from "express";
import { listOrganisationAudit } from "../services/audit.js";

export const listAudit: RequestHandler = async (req, res) => {
  const limitValue = Number(req.query.limit ?? 100);
  const limit = Number.isInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 100;
  const result = await listOrganisationAudit(req.organisationId!, {
    limit,
    cursor: req.query.cursor as string | undefined,
    action: req.query.action as string | undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
    sort: req.query.sort === "asc" ? "asc" : "desc",
  });
  res.json(result);
};
