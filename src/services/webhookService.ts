import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from "node:crypto";
import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { OrganisationRole } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { HttpError } from "../middleware/errors.js";
import { logger } from "../config/logger.js";

export const webhookEvents = ["ACCESS_REQUEST_CREATED", "ACCESS_REQUEST_DECIDED", "ORGANISATION_VERIFICATION_UPDATED"] as const;

function encryptionKey(): Buffer { return createHash("sha256").update(env.JWT_SECRET).digest(); }
function encryptSecret(secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}
function decryptSecret(value: string): string {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv!, "base64url"));
  decipher.setAuthTag(Buffer.from(tag!, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data!, "base64url")), decipher.final()]).toString("utf8");
}

function validateWebhookUrl(rawUrl: string): URL {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new HttpError(400, "Webhook URL must be a valid HTTPS URL"); }
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (url.protocol !== "https:" || (url.port && url.port !== "443") || url.username || url.password || host === "localhost" || host.endsWith(".local") || isIP(host)) {
    throw new HttpError(400, "Webhook URL must use public HTTPS without embedded credentials or an IP literal");
  }
  return url;
}

async function assertPublicResolution(host: string): Promise<void> {
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address, family }) => {
    if (family === 4) {
      const octets = address.split(".").map(Number);
      const a = octets[0] ?? -1;
      const b = octets[1] ?? -1;
      return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0 && octets[2] === 0);
    }
    const normalized = address.toLowerCase();
    return !(normalized.startsWith("2") || normalized.startsWith("3"));
  })) throw new HttpError(400, "Webhook host must resolve only to public IP addresses");
}

export async function createWebhook(input: { organisationId: string; actorId: string; url: string; events: string[] }) {
  validateWebhookUrl(input.url);
  const secret = randomBytes(32).toString("base64url");
  const webhook = await prisma.$transaction(async (tx) => {
    const row = await tx.organisationWebhook.create({ data: {
      organisationId: input.organisationId, createdById: input.actorId, url: input.url,
      encryptedSecret: encryptSecret(secret), events: input.events,
    }, select: { id: true, organisationId: true, url: true, events: true, active: true, createdAt: true } });
    await tx.auditLog.create({ data: { actorUserId: input.actorId, organisationId: input.organisationId, action: "WEBHOOK_CREATED", details: { webhookId: row.id, url: row.url, events: row.events } } });
    return row;
  });
  return { webhook, secret };
}

export async function listWebhooks(organisationId: string) {
  return prisma.organisationWebhook.findMany({ where: { organisationId }, select: { id: true, url: true, events: true, active: true, createdAt: true, updatedAt: true }, orderBy: { createdAt: "desc" } });
}

export async function deleteWebhook(input: { organisationId: string; webhookId: string; actorId: string }) {
  return prisma.$transaction(async (tx) => {
    const row = await tx.organisationWebhook.findFirst({ where: { id: input.webhookId, organisationId: input.organisationId } });
    if (!row) throw new HttpError(404, "Webhook not found");
    await tx.organisationWebhook.delete({ where: { id: row.id } });
    await tx.auditLog.create({ data: { actorUserId: input.actorId, organisationId: input.organisationId, action: "WEBHOOK_DELETED", details: { webhookId: row.id, url: row.url } } });
  });
}

export async function dispatchWebhookEvent(input: { organisationId: string; event: typeof webhookEvents[number]; data: Record<string, unknown> }): Promise<void> {
 try {
  const hooks = await prisma.organisationWebhook.findMany({ where: { organisationId: input.organisationId, active: true, events: { has: input.event } } });
  const payload = JSON.stringify({ id: randomBytes(16).toString("hex"), type: input.event, createdAt: new Date().toISOString(), data: input.data });
  const results = await Promise.allSettled(hooks.map(async (hook) => {
    const url = validateWebhookUrl(hook.url);
    await assertPublicResolution(url.hostname.replace(/^\[|\]$/g, ""));
    const signature = createHmac("sha256", decryptSecret(hook.encryptedSecret)).update(payload).digest("hex");
    const response = await fetch(hook.url, { method: "POST", headers: { "content-type": "application/json", "x-konso-event": input.event, "x-konso-signature": `sha256=${signature}` }, body: payload, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
  }));
  results.forEach((result, index) => {
    if (result.status === "rejected") logger.warn(`Webhook delivery failed for ${hooks[index]?.id}: ${String(result.reason)}`);
  });
 } catch (error) {
  logger.error(`Unable to dispatch webhook event ${input.event}: ${String(error)}`);
 }
}

export async function assertWebhookManager(organisationId: string, userId: string): Promise<void> {
  const membership = await prisma.membership.findUnique({ where: { userId_organisationId: { userId, organisationId } }, select: { role: true } });
  if (!membership || (membership.role !== OrganisationRole.OWNER && membership.role !== OrganisationRole.ADMIN)) throw new HttpError(403, "Organisation owner or admin role is required");
}
