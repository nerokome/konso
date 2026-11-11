import { query } from "express-validator";

export const auditQuerySchema = () => [
  query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("Limit must be between 1 and 200").toInt(),
];
