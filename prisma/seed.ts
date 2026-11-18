import "dotenv/config";
import bcrypt from "bcryptjs";
import { PlatformRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.env.ADMIN_EMAIL ?? "superadmina@example.com";
const password = process.env.ADMIN_PASSWORD;

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to run the administrator seed in production. Provision the administrator through a secure, one-time operator workflow.");
  }
  if (!password) {
    throw new Error("Set ADMIN_PASSWORD before running the seed. The default seed password has been removed.");
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, platformRole: PlatformRole.ADMIN },
    create: { email, passwordHash, platformRole: PlatformRole.ADMIN },
    select: { id: true, email: true, platformRole: true },
  });

  console.info(`Seeded platform administrator: ${admin.email} (${admin.platformRole})`);
}

main()
  .catch((error: unknown) => {
    console.error("Failed to seed platform administrator:", error);
    throw error;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
