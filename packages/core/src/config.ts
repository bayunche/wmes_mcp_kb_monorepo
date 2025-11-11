import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT_API: z.coerce.number().int().positive().default(8080),
  PORT_MCP: z.coerce.number().int().positive().default(9090),
  PORT_WORKER: z.coerce.number().int().positive().default(9100),
  DATABASE_URL: z.string().url(),
  PGVECTOR_DIM: z.coerce.number().int().positive().default(1024),
  QDRANT_URL: z.string().url(),
  MINIO_ENDPOINT: z.string(),
  MINIO_ACCESS_KEY: z.string(),
  MINIO_SECRET_KEY: z.string(),
  REDIS_URL: z.string(),
  RABBITMQ_URL: z.string(),
  MODELS_DIR: z.string(),
  OCR_ENABLED: z
    .union([z.string(), z.boolean()])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .default(true),
  OCR_LANG: z.string().default("chi_sim"),
  JWT_ISSUER: z.string(),
  JWT_AUDIENCE: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  DEFAULT_TENANT_ID: z.string().default("default")
});

export type AppConfig = z.infer<typeof envSchema>;

export function loadConfig(options: { envFile?: string } = {}): AppConfig {
  const envFile = options.envFile ?? resolve(process.cwd(), ".env");
  try {
    loadDotenv({ path: envFile });
  } catch {
    // Ignore missing file; fallback to process.env
  }
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join("\n");
    throw new Error(`Environment validation failed:\n${formatted}`);
  }

  return parsed.data;
}

export function printConfigSample(samplePath = ".env.example") {
  const sample = readFileSync(resolve(process.cwd(), samplePath), "utf8");
  console.log(sample);
}
