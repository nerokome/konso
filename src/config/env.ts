import "dotenv/config";

const nodeEnvironments = ["development", "test", "production"] as const;
const tokenLifetimes = ["5m", "15m", "30m", "1h", "2h"] as const;

function isUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const portValue = process.env.PORT ?? "5000";
const port = Number(portValue);
const databaseUrl = process.env.DATABASE_URL ?? "";
const jwtSecret = process.env.JWT_SECRET ?? "";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN ?? "15m";
const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:3000";
const uploadDir = process.env.UPLOAD_DIR ?? "./src/resources/static/assets/uploads";
const errors: string[] = [];

if (!nodeEnvironments.includes(nodeEnv as (typeof nodeEnvironments)[number])) {
  errors.push("NODE_ENV must be development, test, or production");
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  errors.push("PORT must be an integer between 1 and 65535");
}
if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
  errors.push("DATABASE_URL must be a PostgreSQL connection URL");
}
if (jwtSecret.length < 32) {
  errors.push("JWT_SECRET must be at least 32 characters long");
}
if (!tokenLifetimes.includes(jwtExpiresIn as (typeof tokenLifetimes)[number])) {
  errors.push("JWT_EXPIRES_IN must be one of: 5m, 15m, 30m, 1h, 2h");
}
if (!isUrl(corsOrigin)) {
  errors.push("CORS_ORIGIN must be a valid URL");
}

if (errors.length > 0) {
  console.error("Invalid environment configuration:", errors);
  process.exit(1);
}

export const env = {
  NODE_ENV: nodeEnv as (typeof nodeEnvironments)[number],
  PORT: port,
  DATABASE_URL: databaseUrl,
  JWT_SECRET: jwtSecret,
  JWT_EXPIRES_IN: jwtExpiresIn as (typeof tokenLifetimes)[number],
  CORS_ORIGIN: corsOrigin,
  UPLOAD_DIR: uploadDir,
};
