import "dotenv/config";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PlatformRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const testEmails = [
  "user1@example.com", "user2@example.com", "user3@example.com",
  "user4@example.com", "user5@example.com", "user9@example.com",
];
const testOrganisationNames = [
  "Lagos General Hospital", "University of Ibadan", "Paystack Ltd",
  "Kano Polytechnic", "Accra Fintech Hub",
];
const adminEmail = "superadmina@example.com";
const apply = process.argv.includes("--apply");

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const users = await prisma.user.findMany({ where: { email: { in: testEmails } }, select: { id: true, email: true } });
  const organisations = await prisma.organisation.findMany({ where: { name: { in: testOrganisationNames } }, select: { id: true, name: true } });
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail }, select: { platformRole: true, passwordHash: true } });
  const userIds = users.map(({ id }) => id);
  const organisationIds = organisations.map(({ id }) => id);
  const documents = await prisma.document.findMany({
    where: { OR: [...(organisationIds.length ? [{ organisationId: { in: organisationIds } }] : []), ...(userIds.length ? [{ uploadedById: { in: userIds } }] : [])] },
    select: { id: true, storageKey: true },
  });
  const documentIds = documents.map(({ id }) => id);
  const requestWhere = {
    OR: [
      ...(documentIds.length ? [{ documentId: { in: documentIds } }] : []),
      ...(organisationIds.length ? [{ requesterOrganisationId: { in: organisationIds } }] : []),
      ...(userIds.length ? [{ requesterUserId: { in: userIds } }, { decidedById: { in: userIds } }] : []),
    ],
  };
  const requests = await prisma.accessRequest.findMany({ where: requestWhere, select: { id: true } });
  const requestIds = requests.map(({ id }) => id);
  const grantWhere = {
    OR: [
      ...(documentIds.length ? [{ documentId: { in: documentIds } }] : []),
      ...(organisationIds.length ? [{ organisationId: { in: organisationIds } }] : []),
      ...(requestIds.length ? [{ requestId: { in: requestIds } }] : []),
      ...(userIds.length ? [{ grantedById: { in: userIds } }, { revokedById: { in: userIds } }] : []),
    ],
  };
  const counts = {
    users: users.length, organisations: organisations.length, documents: documents.length,
    accessRequests: requests.length, accessGrants: await prisma.documentAccess.count({ where: grantWhere }),
  };
  console.info("Matched test data:", JSON.stringify({
    users: users.map(({ email }) => email), organisations: organisations.map(({ name }) => name), counts,
    admin: existingAdmin ? { exists: true, platformRole: existingAdmin.platformRole, acceptsPublicDefault: await bcrypt.compare("12345678", existingAdmin.passwordHash) } : { exists: false },
  }));
  if (!apply) {
    console.info("Dry run only. Review the matches, then rerun with --apply to delete them and rotate the public seed admin password.");
    return;
  }

  const newAdminPassword = randomBytes(32).toString("base64url");
  const passwordHash = await bcrypt.hash(newAdminPassword, 12);
  await prisma.$transaction(async (tx) => {
    await tx.documentAccess.deleteMany({ where: grantWhere });
    await tx.accessRequest.deleteMany({ where: requestWhere });
    if (documentIds.length) await tx.document.deleteMany({ where: { id: { in: documentIds } } });
    if (userIds.length || organisationIds.length) {
      await tx.membership.deleteMany({ where: { OR: [...(userIds.length ? [{ userId: { in: userIds } }] : []), ...(organisationIds.length ? [{ organisationId: { in: organisationIds } }] : [])] } });
    }
    if (organisationIds.length) await tx.organisation.deleteMany({ where: { id: { in: organisationIds } } });
    if (userIds.length) await tx.user.deleteMany({ where: { id: { in: userIds } } });
    await tx.user.upsert({
      where: { email: adminEmail },
      update: { passwordHash, platformRole: PlatformRole.ADMIN },
      create: { email: adminEmail, passwordHash, platformRole: PlatformRole.ADMIN },
    });
  });

  const uploadRoot = path.resolve(process.env.UPLOAD_DIR ?? "./src/resources/static/assets/uploads");
  for (const { storageKey } of documents) {
    const filePath = path.resolve(uploadRoot, storageKey);
    if (filePath.startsWith(`${uploadRoot}${path.sep}`)) await unlink(filePath).catch(() => undefined);
  }
  console.info("Production cleanup and admin rotation completed.");
  console.info(`Rotated login: ${adminEmail}`);
  console.info(`New one-time password: ${newAdminPassword}`);
}

main()
  .catch((error: unknown) => {
    console.error("Production maintenance failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
