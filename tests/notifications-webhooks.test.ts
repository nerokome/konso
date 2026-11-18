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

const [{ app }, { prisma }, { OrganisationRole }] = await Promise.all([
  import("../src/app.js"), import("../src/db/prisma.js"), import("@prisma/client"),
]);
const suffix = randomUUID();
let ownerId = "";
let outsiderId = "";
let organisationId = "";
let server: ReturnType<typeof app.listen>;
let baseUrl = "";
let webhookId = "";
const auth = (id: string) => ({ authorization: `Bearer ${jwt.sign({}, process.env.JWT_SECRET!, { subject: id, expiresIn: "15m" })}` });

before(async () => {
  const owner = await prisma.user.create({ data: { email: `owner-${suffix}@example.test`, passwordHash: "unused" } });
  const outsider = await prisma.user.create({ data: { email: `outsider-${suffix}@example.test`, passwordHash: "unused" } });
  const organisation = await prisma.organisation.create({ data: { name: `Webhook test ${suffix}`, memberships: { create: { userId: owner.id, role: OrganisationRole.OWNER } } } });
  ownerId = owner.id; outsiderId = outsider.id; organisationId = organisation.id;
  await prisma.notification.create({ data: { userId: ownerId, organisationId, eventKey: `test:${suffix}`, type: "TEST", title: "Test", message: "Test notification" } });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to start test server");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (organisationId) {
    await prisma.notification.deleteMany({ where: { organisationId } });
    await prisma.organisationWebhook.deleteMany({ where: { organisationId } });
    await prisma.auditLog.deleteMany({ where: { organisationId } });
    await prisma.organisation.delete({ where: { id: organisationId } });
  }
  await prisma.user.deleteMany({ where: { id: { in: [ownerId, outsiderId].filter(Boolean) } } });
  await prisma.$disconnect();
});

test("notifications require authentication", async () => {
  assert.equal((await fetch(`${baseUrl}/api/notifications`)).status, 401);
});

test("authenticated users list and mark their own notifications read", async () => {
  const response = await fetch(`${baseUrl}/api/notifications`, { headers: auth(ownerId) });
  assert.equal(response.status, 200);
  const body = await response.json() as { notifications: Array<{ id: string }> };
  assert.equal(body.notifications.length, 1);
  const marked = await fetch(`${baseUrl}/api/notifications/read`, { method: "PATCH", headers: { ...auth(ownerId), "content-type": "application/json" }, body: JSON.stringify({ ids: [body.notifications[0]!.id] }) });
  assert.equal(marked.status, 200);
});

test("notification read validates UUIDs", async () => {
  const response = await fetch(`${baseUrl}/api/notifications/read`, { method: "PATCH", headers: { ...auth(ownerId), "content-type": "application/json" }, body: JSON.stringify({ ids: ["bad-id"] }) });
  assert.equal(response.status, 400);
});

test("webhook management rejects non-members and invalid URLs", async () => {
  assert.equal((await fetch(`${baseUrl}/api/organisations/${organisationId}/webhooks`, { headers: auth(outsiderId) })).status, 403);
  const invalid = await fetch(`${baseUrl}/api/organisations/${organisationId}/webhooks`, { method: "POST", headers: { ...auth(ownerId), "content-type": "application/json" }, body: JSON.stringify({ url: "http://example.com", events: ["ACCESS_REQUEST_CREATED"] }) });
  assert.equal(invalid.status, 400);
});

test("owner creates webhook with one-time secret and can list/delete it", async () => {
  const created = await fetch(`${baseUrl}/api/organisations/${organisationId}/webhooks`, { method: "POST", headers: { ...auth(ownerId), "content-type": "application/json" }, body: JSON.stringify({ url: "https://hooks.example.com/konso", events: ["ACCESS_REQUEST_CREATED"] }) });
  assert.equal(created.status, 201);
  const createdBody = await created.json() as { webhook: { id: string }; secret: string };
  assert.ok(createdBody.secret.length >= 40);
  webhookId = createdBody.webhook.id;
  const listed = await fetch(`${baseUrl}/api/organisations/${organisationId}/webhooks`, { headers: auth(ownerId) });
  assert.equal(listed.status, 200);
  assert.equal(JSON.stringify(await listed.json()).includes(createdBody.secret), false);
  const deleted = await fetch(`${baseUrl}/api/organisations/${organisationId}/webhooks/${webhookId}`, { method: "DELETE", headers: auth(ownerId) });
  assert.equal(deleted.status, 200);
});

test("owner receives 404 when deleting an unknown webhook", async () => {
  const response = await fetch(`${baseUrl}/api/organisations/${organisationId}/webhooks/${randomUUID()}`, { method: "DELETE", headers: auth(ownerId) });
  assert.equal(response.status, 404);
});
