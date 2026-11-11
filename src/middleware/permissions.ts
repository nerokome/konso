import type { RequestHandler } from "express";
import { OrganisationRole, PlatformRole } from "@prisma/client";
import { prisma } from "../db/prisma.js";
import { HttpError } from "./errors.js";

export async function membershipFor(userId: string, organisationId: string) {
  return prisma.membership.findUnique({ where: { userId_organisationId: { userId, organisationId } } });
}

export function requireOrganisationRole(roles: OrganisationRole[], organisationParam = "organisationId"): RequestHandler {
  return (req, _res, next) => {
    const queryOrganisationId = req.query[organisationParam];
    const organisationId = req.params[organisationParam] ?? req.header("x-organisation-id") ??
      (typeof queryOrganisationId === "string" ? queryOrganisationId : undefined);
    if (!organisationId || !req.auth) {
      next(new HttpError(400, "Organisation ID is required"));
      return;
    }
    void membershipFor(req.auth.userId, organisationId).then((membership) => {
      if (!membership || !roles.includes(membership.role)) {
        next(new HttpError(403, "You do not have the required organisation permissions"));
        return;
      }
      req.organisationId = organisationId;
      req.organisationRole = membership.role;
      next();
    }).catch(next);
  };
}

export function requirePlatformRole(roles: PlatformRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) {
      next(new HttpError(401, "Authentication required"));
      return;
    }
    void prisma.user.findUnique({ where: { id: req.auth.userId }, select: { platformRole: true } }).then((user) => {
      if (!user || !roles.includes(user.platformRole)) {
        next(new HttpError(403, "Platform verifier permission required"));
        return;
      }
      next();
    }).catch(next);
  };
}
