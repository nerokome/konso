import type { RequestHandler } from "express";
import { HttpError } from "./errors.js";

type Bucket = { count: number; resetAt: number };
const attemptsByEmail = new Map<string, Bucket>();
const requestsByIp = new Map<string, Bucket>();
const windowMs = 15 * 60 * 1000;
const maxFailedLogins = 5;
const maxAuthRequestsPerIp = 30;

function consume(bucketMap: Map<string, Bucket>, key: string, limit: number, now: number): Bucket {
  let bucket = bucketMap.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    bucketMap.set(key, bucket);
  }
  bucket.count += 1;
  return bucket;
}

function prune(now: number) {
  for (const [key, bucket] of attemptsByEmail) if (bucket.resetAt <= now) attemptsByEmail.delete(key);
  for (const [key, bucket] of requestsByIp) if (bucket.resetAt <= now) requestsByIp.delete(key);
}

export const authRateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  prune(now);
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const ipBucket = consume(requestsByIp, ip, maxAuthRequestsPerIp, now);
  if (ipBucket.count > maxAuthRequestsPerIp) {
    next(new HttpError(429, "Too many authentication requests; try again later"));
    return;
  }

  if (req.path.endsWith("/register")) {
    next();
    return;
  }

  const rawEmail = (req.body as { email?: unknown } | undefined)?.email;
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!email) {
    next();
    return;
  }
  const emailBucket = attemptsByEmail.get(email);
  if (emailBucket && emailBucket.resetAt > now && emailBucket.count >= maxFailedLogins) {
    next(new HttpError(429, "Too many failed login attempts; try again later"));
    return;
  }

  res.once("finish", () => {
    if (res.statusCode === 401) consume(attemptsByEmail, email, maxFailedLogins, Date.now());
    else if (res.statusCode >= 200 && res.statusCode < 300) attemptsByEmail.delete(email);
  });
  next();
};
