import "dotenv/config";
import bcrypt from "bcryptjs";
import { PlatformRole, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = "superadmina@example.com";
const password = "12345678";

async function main() {
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
