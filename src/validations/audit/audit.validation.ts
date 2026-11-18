import { query } from "express-validator";

export const auditQuerySchema = () => [
  query("limit").optional().isInt({ min: 1, max: 200 }).withMessage("Limit must be between 1 and 200").toInt(),
  query("cursor").optional().isUUID().withMessage("Invalid cursor"),
  query("action").optional().isString().trim().isLength({ min: 1, max: 100 }).withMessage("Action filter must be 1-100 characters"),
  query("from").optional().isISO8601().withMessage("from must be an ISO 8601 date"),
  query("to").optional().isISO8601().withMessage("to must be an ISO 8601 date"),
  query("sort").optional().isIn(["asc", "desc"]).withMessage("sort must be asc or desc"),
];
