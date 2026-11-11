import express from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { errorHandler, HttpError } from "./middleware/errors.js";
import { authRouter } from "./routes/auth.js";
import { healthRouter } from "./routes/health.js";
import { organisationsRouter } from "./routes/organisations.js";
import { documentsRouter } from "./routes/documents.js";
import { auditRouter } from "./routes/audit.js";
import { requestLogger } from "./middleware/requestLogger.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(requestLogger);
app.use(express.json({ limit: "10kb" }));
app.use(healthRouter);
app.use("/api/auth", authRouter);
app.use("/api/organisations", organisationsRouter);
app.use("/api/documents", documentsRouter);
app.use("/api/audit", auditRouter);
app.use((_req, _res, next) => next(new HttpError(404, "Route not found")));
app.use(errorHandler);
