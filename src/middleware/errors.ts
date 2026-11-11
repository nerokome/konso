import type { ErrorRequestHandler } from "express";
import { logger } from "../config/logger.js";

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (typeof error === "object" && error !== null && "type" in error) {
    if (error.type === "entity.parse.failed") {
      res.status(400).json({ error: "Request body contains invalid JSON" });
      return;
    }
    if (error.type === "entity.too.large") {
      res.status(413).json({ error: "Request body exceeds the 10 MB limit" });
      return;
    }
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    if (error.code === "P2002" || error.code === "P2003") {
      res.status(409).json({ error: "The request conflicts with existing data" });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({ error: "Requested record was not found" });
      return;
    }
    if (error.code === "P2023") {
      res.status(400).json({ error: "A supplied identifier is invalid" });
      return;
    }
  }

  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "Internal server error";

  if (status >= 500) {
    logger.error(error instanceof Error ? error.stack ?? error.message : String(error));
  }

  res.status(status).json({ error: message });
};
