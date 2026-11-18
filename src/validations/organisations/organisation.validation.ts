import { OrganisationRole, OrganisationStatus, OrganisationType } from "@prisma/client";
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
  body("reasonCode").optional().isString().trim().isLength({ min: 1, max: 80 }).withMessage("Reason code must be 1-80 characters"),
  param("organisationId").isUUID().withMessage("Invalid organisation ID"),
];

export const organisationIdSchema = () => [param("organisationId").isUUID().withMessage("Invalid organisation ID")];

export const memberRoleSchema = () => [
  param("organisationId").isUUID().withMessage("Invalid organisation ID"),
  param("userId").isUUID().withMessage("Invalid user ID"),
  body("role").isIn(Object.values(OrganisationRole)).withMessage("Invalid organisation role"),
];

export const memberIdsSchema = () => [
  param("organisationId").isUUID().withMessage("Invalid organisation ID"),
  param("userId").isUUID().withMessage("Invalid user ID"),
];

export const updateOrganisationSchema = () => [
  param("organisationId").isUUID().withMessage("Invalid organisation ID"),
  body("name").optional().isString().trim().isLength({ min: 2, max: 160 }).withMessage("Organisation name must be 2-160 characters"),
  body("registrationNumber").optional({ nullable: true }).isString().trim().isLength({ max: 100 }).withMessage("Registration number must be at most 100 characters"),
  body("type").optional().isIn(Object.values(OrganisationType)).withMessage("Invalid organisation type"),
  body().custom((value) => Object.keys(value ?? {}).some((key) => ["name", "registrationNumber", "type"].includes(key))).withMessage("Provide at least one organisation field"),
];

export const resubmitVerificationSchema = () => [param("organisationId").isUUID().withMessage("Invalid organisation ID")];

export const createInvitationSchema = () => [
  param("organisationId").isUUID().withMessage("Invalid organisation ID"),
  body("email").trim().isEmail().normalizeEmail().withMessage("A valid email is required"),
  body("role").isIn([OrganisationRole.ADMIN, OrganisationRole.MEMBER, OrganisationRole.VIEWER]).withMessage("Invalid invitation role"),
];
