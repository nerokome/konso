import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) throw new Error("Set TEST_DATABASE_URL to a dedicated disposable test database before running tests.");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.JWT_SECRET = "test-only-secret-with-at-least-32-characters";
process.env.JWT_EXPIRES_IN = "15m";
process.env.CORS_ORIGIN = "http://localhost:3000";

const [{ app }, { prisma }, { PlatformRole, OrganisationRole }] = await Promise.all([
  import("../src/app.js"), import("../src/db/prisma.js"), import("@prisma/client"),
]);
const fixture = randomUUID();
const adminEmail = `admin-${fixture}@example.test`;
const userEmail = `user-${fixture}@example.test`;
const organisationName = `Test organisation ${fixture}`;
let adminId = "";
let userId = "";
let organisationId = "";
let server: ReturnType<typeof app.listen>;
let baseUrl = "";

function token(userIdValue: string) {
  return jwt.sign({}, process.env.JWT_SECRET!, { subject: userIdValue, expiresIn: "15m" });
}

before(async () => {
  const admin = await prisma.user.create({ data: { email: adminEmail, passwordHash: "unused", platformRole: PlatformRole.ADMIN } });
  const user = await prisma.user.create({ data: { email: userEmail, passwordHash: "unused" } });
  const organisation = await prisma.organisation.create({
    data: { name: organisationName, memberships: { create: { userId: user.id, role: OrganisationRole.OWNER } } },
  });
  adminId = admin.id; userId = user.id; organisationId = organisation.id;
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (organisationId) {
    await prisma.auditLog.deleteMany({ where: { organisationId } });
    await prisma.organisation.delete({ where: { id: organisationId } });
  }
  if (adminId || userId) {
    await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [adminId, userId].filter(Boolean) } } });
    await prisma.user.deleteMany({ where: { id: { in: [adminId, userId].filter(Boolean) } } });
  }
  await prisma.$disconnect();
});

test("admin organisation list returns organisations and pagination metadata", async () => {
  const response = await fetch(`${baseUrl}/api/admin/organisations?limit=10`, { headers: { authorization: `Bearer ${token(adminId)}` } });
  assert.equal(response.status, 200);
  const body = await response.json() as { organisations: Array<{ id: string; memberCount: number; documentCount: number }> };
  const found = body.organisations.find((organisation) => organisation.id === organisationId);
  assert.ok(found);
  assert.equal(found.memberCount, 1);
  assert.equal(found.documentCount, 0);
});

test("admin organisation list rejects missing authentication", async () => {
  const response = await fetch(`${baseUrl}/api/admin/organisations`);
  assert.equal(response.status, 401);
});

test("admin organisation list rejects non-platform users", async () => {
  const response = await fetch(`${baseUrl}/api/admin/organisations`, { headers: { authorization: `Bearer ${token(userId)}` } });
  assert.equal(response.status, 403);
});

test("admin organisation detail returns 404 for an unknown UUID", async () => {
  const response = await fetch(`${baseUrl}/api/admin/organisations/${randomUUID()}`, { headers: { authorization: `Bearer ${token(adminId)}` } });
  assert.equal(response.status, 404);
});

test("admin organisation list validates status filters", async () => {
  const response = await fetch(`${baseUrl}/api/admin/organisations?status=NOT_A_STATUS`, { headers: { authorization: `Bearer ${token(adminId)}` } });
  assert.equal(response.status, 400);
  const body = await response.json() as { details?: unknown[] };
  assert.ok(Array.isArray(body.details));
});
