import { OrganisationRole, type Prisma } from "@prisma/client";
import { prisma } from "../db/prisma.js";

type NotificationInput = {
  userId: string;
  organisationId?: string;
  eventKey: string;
  type: string;
  title: string;
  message: string;
  data?: Prisma.InputJsonValue;
};

export async function notifyUsers(items: NotificationInput[]): Promise<void> {
  if (!items.length) return;
  await prisma.notification.createMany({ data: items, skipDuplicates: true });
}

export async function notifyOrganisation(input: Omit<NotificationInput, "userId" | "eventKey"> & { organisationId: string; eventKey: string; roles?: OrganisationRole[] }): Promise<void> {
  const members = await prisma.membership.findMany({
    where: { organisationId: input.organisationId, ...(input.roles ? { role: { in: input.roles } } : {}) },
    select: { userId: true },
  });
  const { eventKey, roles: _roles, organisationId, ...notification } = input;
  await notifyUsers(members.map(({ userId }) => ({ ...notification, organisationId, userId, eventKey: `${eventKey}:${userId}` })));
}

export async function listNotifications(userId: string, options: { limit: number; cursor?: string; unreadOnly?: boolean }) {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
    take: options.limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const hasMore = rows.length > options.limit;
  const notifications = rows.slice(0, options.limit);
  return { notifications, ...(hasMore ? { nextCursor: notifications.at(-1)?.id } : {}) };
}

export async function markNotificationsRead(userId: string, ids: string[]) {
  const result = await prisma.notification.updateMany({
    where: { userId, id: { in: ids }, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: result.count };
}
