ALTER TABLE "DocumentAccess" ADD COLUMN "expiredAt" TIMESTAMP(3);
CREATE INDEX "DocumentAccess_expiredAt_expiresAt_idx" ON "DocumentAccess"("expiredAt", "expiresAt");
