import { body, param } from "express-validator";

export const accessRequestSchema = () => [
  body("reason").isString().trim().isLength({ min: 5, max: 1000 }).withMessage("Reason must be 5-1000 characters"),
  body("expiresAt").isISO8601().withMessage("expiresAt must be a valid ISO 8601 date").toDate(),
  param("documentId").isUUID().withMessage("Invalid document ID"),
];

export const accessDecisionSchema = () => [
  body("decision").isIn(["APPROVED", "REJECTED"]).withMessage("Decision must be APPROVED or REJECTED"),
  body("note").optional().isString().isLength({ max: 1000 }).withMessage("Note must be at most 1000 characters").trim(),
  param("requestId").isUUID().withMessage("Invalid access request ID"),
];

export const documentUploadSchema = () => [
  body().custom((_value, { req }) => {
    if (!Buffer.isBuffer(req.body)) throw new Error("Request body must contain raw file bytes");
    return true;
  }),
];

export const documentIdSchema = () => [param("documentId").isUUID().withMessage("Invalid document ID")];
