import { OrganisationRole, OrganisationStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";
import { recordAudit } from "./audit.js";

export async function createOrganisation(input: { name: string; registrationNumber?: string; ownerId: string }) {
  const organisation = await prisma.organisation.create({
    data: {
      name: input.name,
      registrationNumber: input.registrationNumber || null,
      memberships: { create: { userId: input.ownerId, role: OrganisationRole.OWNER } },
    },
  });
  await recordAudit({ actorUserId: input.ownerId, organisationId: organisation.id, action: "ORGANISATION_REGISTERED" });
  return organisation;
}

export async function listOrganisations(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId }, include: { organisation: true }, orderBy: { createdAt: "asc" },
  });
  return memberships.map(({ role, organisation }) => ({ ...organisation, role }));
}

export async function getOrganisation(organisationId: string) {
  return prisma.organisation.findUnique({ where: { id: organisationId } });
}

export async function listPendingOrganisations() {
  return prisma.organisation.findMany({ where: { status: OrganisationStatus.PENDING }, orderBy: { createdAt: "asc" } });
}

export async function addMember(input: { organisationId: string; actorId: string; email: string; role: OrganisationRole }) {
  const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (!user) throw new HttpError(404, "User not found; they must register before being added");
  const membership = await prisma.membership.create({
    data: { userId: user.id, organisationId: input.organisationId, role: input.role },
  });
  await recordAudit({
    actorUserId: input.actorId,
    organisationId: input.organisationId,
    action: "MEMBER_ADDED",
    details: { memberUserId: user.id, role: input.role },
  });
  return membership;
}

export async function updateVerification(input: {
  organisationId: string;
  verifierId: string;
  status: "VERIFIED" | "REJECTED";
  note?: string;
}) {
  const organisation = await prisma.organisation.update({
    where: { id: input.organisationId },
    data: {
      status: input.status,
      verificationNote: input.note || null,
      verifiedAt: input.status === OrganisationStatus.VERIFIED ? new Date() : null,
      verifiedById: input.verifierId,
    },
  });
  await recordAudit({
    actorUserId: input.verifierId,
    organisationId: organisation.id,
    action: `ORGANISATION_${input.status}`,
    details: { note: organisation.verificationNote },
  });
  return organisation;
}

