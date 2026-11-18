import { AccessRequestStatus, PlatformRole, OrganisationStatus, Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";
import { recordAudit } from "./audit.js";

type OrganisationFilters = { status?: OrganisationStatus; q?: string; limit: number; cursor?: string };

export async function listAllOrganisations(filters: OrganisationFilters) {
  const where: Prisma.OrganisationWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q ? { OR: [
      { name: { contains: filters.q, mode: "insensitive" } },
      { registrationNumber: { contains: filters.q, mode: "insensitive" } },
    ] } : {}),
  };
  const rows = await prisma.organisation.findMany({
    where, take: filters.limit + 1, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: {
      _count: { select: { memberships: true, documents: true } },
      memberships: { where: { role: "OWNER" }, take: 1, include: { user: { select: { email: true } } } },
      verifiedBy: { select: { id: true, email: true } },
    },
  });
  const hasMore = rows.length > filters.limit;
  const organisations = rows.slice(0, filters.limit).map(({ _count, memberships, ...organisation }) => ({
    ...organisation, memberCount: _count.memberships, documentCount: _count.documents,
    ownerEmail: memberships[0]?.user.email ?? null,
  }));
  return { organisations, ...(hasMore ? { nextCursor: organisations.at(-1)?.id } : {}) };
}

export async function getOrganisationDetail(id: string) {
  const organisation = await prisma.organisation.findUnique({
    where: { id },
    include: {
      memberships: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, email: true } } } },
      _count: { select: { documents: true } },
      verifiedBy: { select: { id: true, email: true } },
    },
  });
  if (!organisation) throw new HttpError(404, "Organisation not found");
  const verificationHistory = await prisma.auditLog.findMany({
    where: { organisationId: id, action: { in: ["ORGANISATION_VERIFIED", "ORGANISATION_REJECTED"] } },
    orderBy: { createdAt: "desc" }, include: { actor: { select: { id: true, email: true } } },
  });
  const { _count, ...details } = organisation;
  return { ...details, memberCount: organisation.memberships.length, documentCount: _count.documents, verificationHistory };
}

export async function getPlatformStats() {
  const [organisations, users, documents, accessRequests] = await Promise.all([
    prisma.organisation.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.user.count(), prisma.document.count(),
    prisma.accessRequest.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return {
    organisations: Object.fromEntries(Object.values(OrganisationStatus).map((status) => [status, organisations.find((row) => row.status === status)?._count._all ?? 0])),
    users, documents,
    accessRequests: Object.fromEntries(Object.values(AccessRequestStatus).map((status) => [status, accessRequests.find((row) => row.status === status)?._count._all ?? 0])),
  };
}

export async function listPlatformAudit(filters: { organisationId?: string; action?: string; from?: Date; to?: Date; limit: number; cursor?: string }) {
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.organisationId ? { organisationId: filters.organisationId } : {}),
    ...(filters.action ? { action: { contains: filters.action, mode: "insensitive" } } : {}),
    ...(filters.from || filters.to ? { createdAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } } : {}),
  };
  const events = await prisma.auditLog.findMany({
    where, take: filters.limit + 1, ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { actor: { select: { id: true, email: true } }, organisation: { select: { id: true, name: true } }, document: { select: { id: true, originalName: true } } },
  });
  const hasMore = events.length > filters.limit;
  const page = events.slice(0, filters.limit);
  return { events: page, ...(hasMore ? { nextCursor: page.at(-1)?.id } : {}) };
}

export async function listUsers(limit: number, cursor?: string) {
  const rows = await prisma.user.findMany({
    take: limit + 1, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, email: true, platformRole: true, createdAt: true, _count: { select: { memberships: true } } },
  });
  const hasMore = rows.length > limit;
  const users = rows.slice(0, limit);
  return { users, ...(hasMore ? { nextCursor: users.at(-1)?.id } : {}) };
}

export async function updateUserRole(input: { userId: string; actorId: string; role: PlatformRole }) {
  if (input.userId === input.actorId && input.role !== PlatformRole.ADMIN) {
    throw new HttpError(403, "An administrator cannot change their own platform role");
  }
  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, platformRole: true } });
    if (!existing) throw new HttpError(404, "User not found");
    if (existing.platformRole === PlatformRole.ADMIN && input.role !== PlatformRole.ADMIN) {
      const admins = await tx.user.count({ where: { platformRole: PlatformRole.ADMIN } });
      if (admins <= 1) throw new HttpError(409, "The last platform administrator cannot be demoted");
    }
    const user = await tx.user.update({ where: { id: input.userId }, data: { platformRole: input.role }, select: { id: true, email: true, platformRole: true } });
    await tx.auditLog.create({ data: {
      actorUserId: input.actorId, action: "PLATFORM_ROLE_UPDATED",
      details: { userId: user.id, previousRole: existing.platformRole, role: user.platformRole },
    } });
    return user;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
