import { OrganisationRole, OrganisationStatus, OrganisationType } from "@prisma/client";
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

export async function listVerifiedOrganisations() {
  return prisma.organisation.findMany({
    where: { status: OrganisationStatus.VERIFIED },
    select: { id: true, name: true }, orderBy: { name: "asc" },
  });
}

export async function listDiscoverableDocuments(organisationId: string) {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId }, select: { status: true } });
  if (!organisation || organisation.status !== OrganisationStatus.VERIFIED) throw new HttpError(404, "Verified organisation not found");
  return prisma.document.findMany({
    where: { organisationId, discoverable: true, deletedAt: null },
    select: { id: true, title: true, category: true, department: true, description: true, tags: true, mimeType: true, sizeBytes: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrganisation(organisationId: string) {
  return prisma.organisation.findUnique({ where: { id: organisationId } });
}

export async function updateOrganisation(input: { organisationId: string; actorId: string; name?: string; registrationNumber?: string | null; type?: OrganisationType }) {
  return prisma.$transaction(async (tx) => {
    const organisation = await tx.organisation.update({
      where: { id: input.organisationId },
      data: { name: input.name, registrationNumber: input.registrationNumber, type: input.type },
    });
    await tx.auditLog.create({ data: { actorUserId: input.actorId, organisationId: organisation.id, action: "ORGANISATION_PROFILE_UPDATED", details: { fields: Object.keys(input).filter((key) => !["organisationId", "actorId"].includes(key)) } } });
    return organisation;
  });
}

export async function resubmitVerification(input: { organisationId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.organisation.findUnique({ where: { id: input.organisationId }, select: { status: true } });
    if (!existing) throw new HttpError(404, "Organisation not found");
    if (existing.status !== OrganisationStatus.REJECTED) throw new HttpError(409, "Only rejected organisations can be resubmitted");
    const organisation = await tx.organisation.update({
      where: { id: input.organisationId },
      data: { status: OrganisationStatus.PENDING, verificationNote: null, verifiedAt: null, verifiedById: null },
    });
    await tx.auditLog.create({ data: { actorUserId: input.actorId, organisationId: organisation.id, action: "ORGANISATION_RESUBMITTED", details: { previousStatus: existing.status } } });
    return organisation;
  });
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

export async function listMembers(organisationId: string) {
  return prisma.membership.findMany({
    where: { organisationId }, orderBy: { createdAt: "asc" },
    select: { userId: true, role: true, createdAt: true, user: { select: { email: true } } },
  }).then((rows) => rows.map(({ userId, role, createdAt, user }) => ({ userId, email: user.email, role, joinedAt: createdAt })));
}

export async function changeMemberRole(input: { organisationId: string; userId: string; actorId: string; role: OrganisationRole }) {
  const result = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({ where: { userId_organisationId: { userId: input.userId, organisationId: input.organisationId } } });
    if (!membership) throw new HttpError(404, "Organisation member not found");
    if (membership.role === OrganisationRole.OWNER && input.role !== OrganisationRole.OWNER) {
      const owners = await tx.membership.count({ where: { organisationId: input.organisationId, role: OrganisationRole.OWNER } });
      if (owners <= 1) throw new HttpError(409, "The last organisation owner cannot be demoted");
    }
    const updated = await tx.membership.update({ where: { id: membership.id }, data: { role: input.role } });
    await tx.auditLog.create({ data: {
      actorUserId: input.actorId, organisationId: input.organisationId, action: "MEMBER_ROLE_UPDATED",
      details: { userId: input.userId, previousRole: membership.role, role: updated.role },
    } });
    return updated;
  }, { isolationLevel: "Serializable" });
  return result;
}

export async function removeMember(input: { organisationId: string; userId: string; actorId: string }) {
  const removed = await prisma.$transaction(async (tx) => {
    const membership = await tx.membership.findUnique({ where: { userId_organisationId: { userId: input.userId, organisationId: input.organisationId } } });
    if (!membership) throw new HttpError(404, "Organisation member not found");
    if (membership.role === OrganisationRole.OWNER) {
      const owners = await tx.membership.count({ where: { organisationId: input.organisationId, role: OrganisationRole.OWNER } });
      if (owners <= 1) throw new HttpError(409, "The last organisation owner cannot be removed");
    }
    await tx.membership.delete({ where: { id: membership.id } });
    await tx.auditLog.create({ data: {
      actorUserId: input.actorId, organisationId: input.organisationId,
      action: "MEMBER_REMOVED", details: { userId: input.userId, role: membership.role },
    } });
    return membership;
  }, { isolationLevel: "Serializable" });
}

export async function updateVerification(input: {
  organisationId: string;
  verifierId: string;
  status: "VERIFIED" | "REJECTED";
  note?: string;
  reasonCode?: string;
}) {
  const previous = await prisma.organisation.findUnique({
    where: { id: input.organisationId }, select: { status: true },
  });
  if (!previous) throw new HttpError(404, "Organisation not found");
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
    details: { note: organisation.verificationNote, reasonCode: input.reasonCode ?? null, previousStatus: previous.status },
  });
  return organisation;
}

