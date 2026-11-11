import type { OrganisationRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        userId: string;
      };
      organisationId?: string;
      organisationRole?: OrganisationRole;
    }
  }
}

export {};
