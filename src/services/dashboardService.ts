import { AccessRequestStatus } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export async function getDashboardSummary(organisationId: string) {
  const [documentCount, incomingGroups, outgoingGroups, activeGrants, recentActivity] = await Promise.all([
    prisma.document.count({ where: { organisationId, deletedAt: null } }),
    prisma.accessRequest.groupBy({ by: ["status"], where: { document: { organisationId, deletedAt: null } }, _count: { _all: true } }),
    prisma.accessRequest.groupBy({ by: ["status"], where: { requesterOrganisationId: organisationId, document: { deletedAt: null } }, _count: { _all: true } }),
    prisma.documentAccess.count({ where: { organisationId, revokedAt: null, expiresAt: { gt: new Date() }, document: { deletedAt: null } } }),
    prisma.auditLog.findMany({
      where: { organisationId }, take: 10, orderBy: { createdAt: "desc" },
      select: { id: true, action: true, details: true, createdAt: true, actor: { select: { id: true, email: true } } },
    }),
  ]);
  const counts = (rows: typeof incomingGroups) => Object.fromEntries(
    Object.values(AccessRequestStatus).map((status) => [status, rows.find((row) => row.status === status)?._count._all ?? 0]),
  );
  return { documentCount, incomingRequests: counts(incomingGroups), outgoingRequests: counts(outgoingGroups), activeGrants, recentActivity };
}
