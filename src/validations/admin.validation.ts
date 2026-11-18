import { OrganisationStatus, PlatformRole } from "@prisma/client";
import { body, param, query } from "express-validator";

export const adminOrganisationListSchema = () => [
  query("status").optional().isIn(Object.values(OrganisationStatus)).withMessage("Invalid organisation status"),
  query("q").optional().isString().trim().isLength({ max: 160 }),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("cursor").optional().isUUID().withMessage("Invalid cursor"),
];

export const adminIdSchema = () => [param("id").isUUID().withMessage("Invalid ID")];

export const adminAuditSchema = () => [
  query("organisationId").optional().isUUID().withMessage("Invalid organisation ID"),
  query("action").optional().isString().trim().isLength({ min: 1, max: 100 }),
  query("from").optional().isISO8601().withMessage("from must be an ISO 8601 date"),
  query("to").optional().isISO8601().withMessage("to must be an ISO 8601 date"),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("cursor").optional().isUUID().withMessage("Invalid cursor"),
];

export const adminUsersSchema = () => [
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  query("cursor").optional().isUUID().withMessage("Invalid cursor"),
];

export const updatePlatformRoleSchema = () => [
  ...adminIdSchema(),
  body("role").isIn(Object.values(PlatformRole)).withMessage("Invalid platform role"),
];
