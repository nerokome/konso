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

export async function listOrganisationAudit(organisationId: string, options: { limit: number; cursor?: string; action?: string; from?: Date; to?: Date; sort: "asc" | "desc" }) {
  const events = await prisma.auditLog.findMany({
    where: {
      organisationId,
      ...(options.action ? { action: { contains: options.action, mode: "insensitive" } } : {}),
      ...(options.from || options.to ? { createdAt: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } } : {}),
    },
    take: options.limit + 1, ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: {
      actor: { select: { id: true, email: true } },
      document: { select: { id: true, originalName: true } },
    },
    orderBy: [{ createdAt: options.sort }, { id: options.sort }],
  });
  const hasMore = events.length > options.limit;
  const page = events.slice(0, options.limit);
  return { events: page, ...(hasMore ? { nextCursor: page.at(-1)?.id } : {}) };
}
