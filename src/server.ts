import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./db/prisma.js";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { logger } from "./config/logger.js";

async function start(): Promise<void> {
  await prisma.$connect();
  logger.info("connected to the database");
  await mkdir(path.resolve(env.UPLOAD_DIR), { recursive: true });
  logger.info(`✅ SUCCESS: File storage active at ${path.resolve(env.UPLOAD_DIR)}`);

  const server = app.listen(env.PORT, () => {
    logger.info(`Server started on port ${env.PORT} 🔥🔥🔥`);
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    logger.error(`Failed to listen on port ${env.PORT}: ${error.message}`);
    void prisma.$disconnect().finally(() => {
      process.exitCode = 1;
    });
  });

  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received; closing HTTP server`);

    server.close((error) => {
      void prisma.$disconnect().then(() => {
        if (error) {
          logger.error(`Error closing HTTP server: ${error.message}`);
          process.exitCode = 1;
        }
      }).catch((disconnectError: unknown) => {
        logger.error(`Error disconnecting from database: ${String(disconnectError)}`);
        process.exitCode = 1;
      });
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

start().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`Failed to connect to PostgreSQL or start the API: ${message}`);
  await prisma.$disconnect().catch(() => undefined);
  process.exitCode = 1;
});
