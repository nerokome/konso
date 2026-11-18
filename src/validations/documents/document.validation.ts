import { DocumentCategory } from "@prisma/client";
import { body, header, param, query } from "express-validator";

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
  header("x-document-title").optional().isString().trim().isLength({ max: 160 }).withMessage("Title must be at most 160 characters"),
  header("x-document-category").optional().isIn(Object.values(DocumentCategory)).withMessage("Invalid document category"),
  header("x-document-department").optional().isString().trim().isLength({ max: 120 }).withMessage("Department must be at most 120 characters"),
  header("x-document-description").optional().isString().trim().isLength({ max: 2000 }).withMessage("Description must be at most 2000 characters"),
  header("x-document-tags").optional().isString().custom((value) => value.split(",").length <= 20 && value.length <= 1000).withMessage("Provide at most 20 comma-separated tags"),
  header("x-document-discoverable").optional().isIn(["true", "false"]).withMessage("discoverable must be true or false"),
  body().custom((_value, { req }) => {
    if (!Buffer.isBuffer(req.body)) throw new Error("Request body must contain raw file bytes");
    return true;
  }),
];

export const documentIdSchema = () => [param("documentId").isUUID().withMessage("Invalid document ID")];

export const accessRequestIdSchema = () => [param("requestId").isUUID().withMessage("Invalid access request ID")];

export const documentIdParamSchema = () => [param("documentId").isUUID().withMessage("Invalid document ID")];

export const documentListSchema = () => [
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt().withMessage("Limit must be between 1 and 100"),
  query("cursor").optional().isUUID().withMessage("Invalid cursor"),
  query("q").optional().isString().trim().isLength({ max: 120 }).withMessage("Search query must be at most 120 characters"),
  query("sort").optional().isIn(["asc", "desc"]).withMessage("sort must be asc or desc"),
];

export const documentDownloadSchema = () => [
  param("documentId").isUUID().withMessage("Invalid document ID"),
  query("disposition").optional().isIn(["inline", "attachment"]).withMessage("disposition must be inline or attachment"),
];
