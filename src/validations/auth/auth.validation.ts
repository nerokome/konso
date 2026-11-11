import { body } from "express-validator";

export const registerSchema = () => [
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isString().isLength({ min: 8, max: 72 }).withMessage("Password must be 8-72 characters"),
];

export const loginSchema = () => [
  body("email").trim().isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isString().notEmpty().withMessage("Password is required"),
];
