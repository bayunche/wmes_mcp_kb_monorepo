import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const optionalUrl = z
  .string()
  .url()
  .or(z.literal(""))
  .optional()
  .transform((value) => (value && value.length ? value : undefined));

const optionalString = z
  .string()
  .or(z.literal(""))
  .optional()
  .transform((value) => (value && value.length ? value : undefined));

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
  MINIO_BUCKET_RAW: z.string().default("kb-raw"),
  MINIO_BUCKET_PREVIEW: z.string().default("kb-preview"),
  REDIS_URL: z.string(),
  // 默认值更适合本机开发；容器内运行时通过环境变量覆盖为 queue:5672
  RABBITMQ_URL: z.string().default("amqp://guest:guest@localhost:5672"),
  MODELS_DIR: z.string(),
  OCR_ENABLED: z
    .union([z.string(), z.boolean()])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .default(true),
  OCR_LANG: z.string().default("chi_sim"),
  OCR_MODE: z.enum(["auto", "local", "http"]).default("auto"),
  OCR_LOCAL_COMMAND: optionalString,
  OCR_API_URL: optionalUrl,
  OCR_API_KEY: optionalString,
  RAW_OBJECT_MAX_MEMORY_MB: z.coerce.number().int().positive().default(128),
  UNSTRUCTURED_API_URL: optionalUrl,
  UNSTRUCTURED_API_KEY: optionalString,
  TEXT_EMBEDDING_ENDPOINT: optionalUrl,
  RERANK_ENDPOINT: optionalUrl,
  IMAGE_EMBEDDING_ENDPOINT: optionalUrl,
  VECTOR_API_KEY: optionalString,
  MAX_TOKENS_PER_SEGMENT: z.coerce.number().int().positive().default(1024),
  LOCAL_EMBEDDING_ENABLED: z
    .union([z.string(), z.boolean()])
    .transform((value) => (typeof value === "boolean" ? value : value === "true"))
    .default(false),
  LOCAL_TEXT_MODEL_ID: optionalString,
  LOCAL_IMAGE_MODEL_ID: optionalString,
  LOCAL_RERANK_MODEL_ID: optionalString,
  VECTOR_FALLBACK_DIM: z.coerce.number().int().positive().default(512),
  CHUNK_MAX_CHARS: z.coerce.number().int().positive().default(900),
  CHUNK_OVERLAP_CHARS: z.coerce.number().int().nonnegative().default(120),
  JWT_ISSUER: z.string(),
  JWT_AUDIENCE: z.string(),
  JWT_PUBLIC_KEY: z.string(),
  DEFAULT_TENANT_ID: z.string().default("default"),
  DEFAULT_LIBRARY_ID: z.string().default("default")
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
