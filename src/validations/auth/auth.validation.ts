import { body } from "express-validator";

export const registerSchema = () => [
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isString().isLength({ min: 8, max: 72 }).withMessage("Password must be 8-72 characters"),
];

export const loginSchema = () => [
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isString().notEmpty().withMessage("Password is required"),
];

export const refreshTokenSchema = () => [
  body("refreshToken").isString().trim().isLength({ min: 40, max: 200 }).withMessage("A valid refresh token is required"),
];

export const updateProfileSchema = () => [
  body("firstName").optional().isString().trim().isLength({ min: 1, max: 80 }).withMessage("firstName must be 1-80 characters"),
  body("lastName").optional().isString().trim().isLength({ min: 1, max: 80 }).withMessage("lastName must be 1-80 characters"),
  body("avatarUrl").optional().isURL({ protocols: ["https"], require_protocol: true }).isLength({ max: 2048 }).withMessage("avatarUrl must be an HTTPS URL"),
  body().custom((value) => Object.keys(value ?? {}).some((key) => ["firstName", "lastName", "avatarUrl"].includes(key))).withMessage("Provide at least one profile field"),
];

export const changePasswordSchema = () => [
  body("currentPassword").isString().notEmpty().withMessage("Current password is required"),
  body("newPassword").isString().isLength({ min: 12, max: 72 }).withMessage("New password must be 12-72 characters"),
];
