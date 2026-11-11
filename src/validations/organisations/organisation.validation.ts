import { OrganisationRole, OrganisationStatus } from "@prisma/client";
import { body, param } from "express-validator";

export const createOrganisationSchema = () => [
  body("name").isString().trim().isLength({ min: 2, max: 160 }).withMessage("Organisation name must be 2-160 characters"),
  body("registrationNumber").optional().isString().trim().isLength({ max: 100 }).withMessage("Registration number must be at most 100 characters"),
];

export const addMemberSchema = () => [
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("role").isIn([OrganisationRole.ADMIN, OrganisationRole.MEMBER, OrganisationRole.VIEWER]).withMessage("Invalid organisation role"),
];

export const verificationSchema = () => [
  body("status").isIn([OrganisationStatus.VERIFIED, OrganisationStatus.REJECTED]).withMessage("Status must be VERIFIED or REJECTED"),
  body("note").optional().isString().isLength({ max: 1000 }).withMessage("Note must be at most 1000 characters").trim(),
  param("organisationId").isUUID().withMessage("Invalid organisation ID"),
];

export const organisationIdSchema = () => [param("organisationId").isUUID().withMessage("Invalid organisation ID")];
