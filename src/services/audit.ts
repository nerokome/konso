import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

export async function recordAudit(input: {
  actorUserId?: string;
  organisationId?: string;
  documentId?: string;
  requestId?: string;
  action: string;
  details?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({ data: input });
}

export async function listOrganisationAudit(organisationId: string, limit: number) {
  return prisma.auditLog.findMany({
    where: { organisationId },
    include: {
      actor: { select: { id: true, email: true } },
      document: { select: { id: true, originalName: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
