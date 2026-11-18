import { createHash, randomBytes } from "node:crypto";
import { OrganisationRole } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createInvitation(input: { organisationId: string; actorId: string; email: string; role: OrganisationRole }) {
  const existingUser = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
  if (existingUser) throw new HttpError(409, "This person is already registered; add them as an organisation member");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const invitation = await prisma.$transaction(async (tx) => {
    const created = await tx.invitation.create({
      data: { organisationId: input.organisationId, invitedById: input.actorId, email: input.email, role: input.role, tokenHash: tokenHash(token), expiresAt },
      select: { id: true, organisationId: true, email: true, role: true, expiresAt: true },
    });
    await tx.auditLog.create({ data: { actorUserId: input.actorId, organisationId: input.organisationId, action: "MEMBER_INVITED", details: { invitationId: created.id, email: created.email, role: created.role } } });
    return created;
  });
  return { invitation, token };
}

export async function acceptInvitation(rawToken: string, userId: string) {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: tokenHash(rawToken) } });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) throw new HttpError(404, "Invitation is invalid or expired");
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || user.email.toLowerCase() !== invitation.email.toLowerCase()) throw new HttpError(403, "This invitation belongs to a different email address");
  return prisma.$transaction(async (tx) => {
    const accepted = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } }, data: { acceptedAt: new Date(), acceptedById: userId } });
    if (!accepted.count) throw new HttpError(404, "Invitation is invalid or expired");
    const membership = await tx.membership.create({ data: { organisationId: invitation.organisationId, userId, role: invitation.role } });
    await tx.auditLog.create({ data: { actorUserId: userId, organisationId: invitation.organisationId, action: "INVITATION_ACCEPTED", details: { invitationId: invitation.id, role: invitation.role } } });
    return membership;
  });
}
