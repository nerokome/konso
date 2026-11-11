import winston from "winston";

const timestampFormat = "YYYY-MM-DD HH:mm:ss:SSSS";

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: timestampFormat }),
    winston.format.printf(({ timestamp, level, message }) => `${timestamp} [${level}]: ${message}`),
  ),
  transports: [new winston.transports.Console()],
});
