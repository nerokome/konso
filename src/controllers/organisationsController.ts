import { OrganisationRole, OrganisationStatus } from "@prisma/client";
import type { RequestHandler } from "express";
import { HttpError } from "../middleware/errors.js";
import * as organisations from "../services/organisationService.js";
import * as invitations from "../services/invitationService.js";

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

export const listVerifiedOrganisations: RequestHandler = async (_req, res) => {
  res.json({ organisations: await organisations.listVerifiedOrganisations() });
};

export const listDocumentCatalog: RequestHandler = async (req, res) => {
  res.json({ documents: await organisations.listDiscoverableDocuments(req.params.organisationId!) });
};

export const updateOrganisation: RequestHandler = async (req, res) => {
  const fields = req.body as { name?: string; registrationNumber?: string | null; type?: import("@prisma/client").OrganisationType };
  const organisation = await organisations.updateOrganisation({ ...fields, organisationId: req.params.organisationId!, actorId: req.auth!.userId });
  res.json({ organisation });
};

export const resubmitVerification: RequestHandler = async (req, res) => {
  const organisation = await organisations.resubmitVerification({ organisationId: req.params.organisationId!, actorId: req.auth!.userId });
  res.json({ organisation });
};

export const createInvitation: RequestHandler = async (req, res) => {
  const { email, role } = req.body as { email: string; role: OrganisationRole };
  if (role === OrganisationRole.ADMIN && req.organisationRole !== OrganisationRole.OWNER) throw new HttpError(403, "Only an organisation owner can invite an admin");
  const result = await invitations.createInvitation({ organisationId: req.params.organisationId!, actorId: req.auth!.userId, email, role });
  res.status(201).json(result);
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

export const listMembers: RequestHandler = async (req, res) => {
  res.json({ members: await organisations.listMembers(req.params.organisationId!) });
};

export const changeMemberRole: RequestHandler = async (req, res) => {
  const { role } = req.body as { role: OrganisationRole };
  if ((role === OrganisationRole.OWNER || role === OrganisationRole.ADMIN) && req.organisationRole !== OrganisationRole.OWNER) {
    throw new HttpError(403, "Only an organisation owner can appoint owners or admins");
  }
  const membership = await organisations.changeMemberRole({
    organisationId: req.params.organisationId!, userId: req.params.userId!, actorId: req.auth!.userId, role,
  });
  res.json({ membership });
};

export const removeMember: RequestHandler = async (req, res) => {
  await organisations.removeMember({ organisationId: req.params.organisationId!, userId: req.params.userId!, actorId: req.auth!.userId });
  res.json({ status: "removed" });
};

export const updateVerification: RequestHandler = async (req, res) => {
  const { status, note, reasonCode } = req.body as { status: "VERIFIED" | "REJECTED"; note?: string; reasonCode?: string };
  const organisation = await organisations.updateVerification({
    organisationId: req.params.organisationId!,
    verifierId: req.auth!.userId,
    status,
    note,
    reasonCode,
  });
  res.json({ organisation });
};
