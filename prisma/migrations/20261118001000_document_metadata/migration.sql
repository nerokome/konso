CREATE TYPE "DocumentCategory" AS ENUM ('HR', 'EDUCATION', 'BUSINESS', 'HEALTHCARE', 'FINANCE', 'OTHER');

ALTER TABLE "Document"
  ADD COLUMN "title" TEXT,
  ADD COLUMN "category" "DocumentCategory",
  ADD COLUMN "department" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "discoverable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "Document_organisationId_deletedAt_createdAt_idx" ON "Document"("organisationId", "deletedAt", "createdAt");
