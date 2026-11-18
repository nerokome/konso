CREATE TYPE "OrganisationType" AS ENUM ('BUSINESS', 'SCHOOL', 'HOSPITAL', 'FINANCIAL', 'GOVERNMENT');
ALTER TABLE "Organisation" ADD COLUMN "type" "OrganisationType";
