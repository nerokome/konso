import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";

function issueToken(userId: string): string {
  return jwt.sign({}, env.JWT_SECRET, {
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
  });
}

const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;

function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(userId: string): Promise<string> {
  const token = randomBytes(48).toString("base64url");
  await prisma.refreshToken.create({ data: { userId, tokenHash: hashRefreshToken(token), expiresAt: new Date(Date.now() + refreshLifetimeMs) } });
  return token;
}

async function authResponse(user: { id: string; email: string; platformRole: string }, memberships: unknown[] = []) {
  return { user, memberships, token: issueToken(user.id), refreshToken: await createRefreshToken(user.id) };
}

export async function registerUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { email, passwordHash },
    select: { id: true, email: true, platformRole: true },
  });
  return authResponse(user);
}

export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user ? await bcrypt.compare(password, user.passwordHash) : false;
  if (!user || !passwordMatches) return null;
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { role: true, organisation: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return authResponse({ id: user.id, email: user.email, platformRole: user.platformRole }, memberships);
}

export async function refreshUserSession(rawToken: string) {
  const tokenHash = hashRefreshToken(rawToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, email: true, platformRole: true } } } });
  const now = new Date();
  if (!stored || stored.revokedAt || stored.expiresAt <= now) return null;
  const nextToken = randomBytes(48).toString("base64url");
  const nextHash = hashRefreshToken(nextToken);
  const memberships = await prisma.membership.findMany({
    where: { userId: stored.userId },
    select: { role: true, organisation: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  const rotated = await prisma.$transaction(async (tx) => {
    const result = await tx.refreshToken.updateMany({ where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } }, data: { revokedAt: now } });
    if (!result.count) return false;
    await tx.refreshToken.create({ data: { userId: stored.userId, tokenHash: nextHash, expiresAt: new Date(now.getTime() + refreshLifetimeMs) } });
    return true;
  });
  if (!rotated) return null;
  return { user: stored.user, memberships, token: issueToken(stored.userId), refreshToken: nextToken };
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({ where: { tokenHash: hashRefreshToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) throw new HttpError(401, "Current password is incorrect");
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash } });
    await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorUserId: userId, action: "PASSWORD_CHANGED" } });
  });
}

export async function getCurrentUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, platformRole: true, firstName: true, lastName: true, avatarUrl: true, createdAt: true },
  });
  if (!user) return null;
  const memberships = await prisma.membership.findMany({
    where: { userId: user.id },
    select: { role: true, organisation: { select: { id: true, name: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });
  return { user, memberships };
}

export async function updateCurrentUser(userId: string, input: { firstName?: string; lastName?: string; avatarUrl?: string }) {
  const data = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId }, data,
      select: { id: true, email: true, platformRole: true, firstName: true, lastName: true, avatarUrl: true, createdAt: true },
    });
    await tx.auditLog.create({ data: { actorUserId: userId, action: "USER_PROFILE_UPDATED", details: { fields: Object.keys(data) } } });
    return user;
  });
}
