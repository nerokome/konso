import { OrganisationRole, OrganisationStatus } from "@prisma/client";
import type { RequestHandler } from "express";
import { HttpError } from "../middleware/errors.js";
import * as organisations from "../services/organisationService.js";

export const createOrganisation: RequestHandler = async (req, res) => {
  const { name, registrationNumber } = req.body as { name: string; registrationNumber?: string };
  const organisation = await organisations.createOrganisation({
    name,
    registrationNumber,
    ownerId: req.auth!.userId,
  });
  res.status(201).json({ organisation });
};

export const listOrganisations: RequestHandler = async (req, res) => {
  res.json({ organisations: await organisations.listOrganisations(req.auth!.userId) });
};

export const getOrganisation: RequestHandler = async (req, res) => {
  const organisation = await organisations.getOrganisation(req.organisationId!);
  if (!organisation) throw new HttpError(404, "Organisation not found");
  res.json({ organisation, role: req.organisationRole });
};

export const listPendingOrganisations: RequestHandler = async (_req, res) => {
  res.json({ organisations: await organisations.listPendingOrganisations() });
};

export const addMember: RequestHandler = async (req, res) => {
  const { email, role } = req.body as { email: string; role: OrganisationRole };
  if (role === OrganisationRole.ADMIN && req.organisationRole !== OrganisationRole.OWNER) {
    throw new HttpError(403, "Only an organisation owner can appoint an admin");
  }
  const membership = await organisations.addMember({
    organisationId: req.organisationId!, actorId: req.auth!.userId, email, role,
  });
  res.status(201).json({ membership });
};

export const updateVerification: RequestHandler = async (req, res) => {
  const { status, note } = req.body as { status: "VERIFIED" | "REJECTED"; note?: string };
  const organisation = await organisations.updateVerification({
    organisationId: req.params.organisationId!,
    verifierId: req.auth!.userId,
    status,
    note,
  });
  res.json({ organisation });
};
