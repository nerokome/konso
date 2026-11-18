import { PlatformRole, OrganisationStatus } from "@prisma/client";
import type { RequestHandler } from "express";
import * as admin from "../services/adminService.js";

function pageSize(value: unknown): number {
  const parsed = Number(value ?? 50);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(parsed, 100)) : 50;
}

export const listOrganisations: RequestHandler = async (req, res) => {
  const status = req.query.status as OrganisationStatus | undefined;
  const result = await admin.listAllOrganisations({ status, q: req.query.q as string | undefined, limit: pageSize(req.query.limit), cursor: req.query.cursor as string | undefined });
  res.json(result);
};

export const getOrganisation: RequestHandler = async (req, res) => {
  res.json({ organisation: await admin.getOrganisationDetail(req.params.id!) });
};

export const stats: RequestHandler = async (_req, res) => res.json(await admin.getPlatformStats());

export const audit: RequestHandler = async (req, res) => {
  const result = await admin.listPlatformAudit({
    organisationId: req.query.organisationId as string | undefined,
    action: req.query.action as string | undefined,
    from: req.query.from ? new Date(String(req.query.from)) : undefined,
    to: req.query.to ? new Date(String(req.query.to)) : undefined,
    limit: pageSize(req.query.limit), cursor: req.query.cursor as string | undefined,
  });
  res.json(result);
};

export const users: RequestHandler = async (req, res) => {
  res.json(await admin.listUsers(pageSize(req.query.limit), req.query.cursor as string | undefined));
};

export const updateRole: RequestHandler = async (req, res) => {
  const { role } = req.body as { role: PlatformRole };
  res.json({ user: await admin.updateUserRole({ userId: req.params.id!, actorId: req.auth!.userId, role }) });
};
