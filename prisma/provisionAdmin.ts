import "dotenv/config";
import bcrypt from "bcryptjs";
import { PlatformRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password || password.length < 12) {
    throw new Error("Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters before provisioning.");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, platformRole: PlatformRole.ADMIN },
    create: { email, passwordHash, platformRole: PlatformRole.ADMIN },
    select: { email: true, platformRole: true },
  });
  console.info(`Provisioned platform administrator: ${admin.email} (${admin.platformRole})`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to provision platform administrator:", error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
