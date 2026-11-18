import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code: string = codeFor(status, message),
  ) {
    super(message);
    this.name = "HttpError";
  }
}

function codeFor(status: number, message: string): string {
  if (message.includes("Organisation must be verified")) return "ORG_NOT_VERIFIED";
  if (message.includes("Active access grant not found")) return "GRANT_NOT_FOUND";
  if (message.includes("already been decided")) return "REQUEST_ALREADY_DECIDED";
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL_SERVER_ERROR";
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: "Request body contains invalid JSON", code: "INVALID_JSON" });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "Request body exceeds the 10 KB limit", code: "BODY_TOO_LARGE" });
      return;
    }
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "P2002" || error.code === "P2003") {
      res.status(409).json({ error: "The request conflicts with existing data", code: "DATA_CONFLICT" });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({ error: "Requested record was not found", code: "RECORD_NOT_FOUND" });
      return;
    }
    if (error.code === "P2023") {
      res.status(400).json({ error: "A supplied identifier is invalid", code: "INVALID_ID" });
      return;
    }
  }

  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "Internal server error";

  if (status >= 500) {
    logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }

  res.status(status).json({ error: message, code: error instanceof HttpError ? error.code : "INTERNAL_SERVER_ERROR" });
};
