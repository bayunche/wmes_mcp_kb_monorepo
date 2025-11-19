import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";

export type ModelRoleKind = "text" | "rerank" | "image" | "ocr" | "metadata" | "structure";

const ROLE_DIR_MAP: Record<ModelRoleKind, string> = {
  text: "text",
  rerank: "rerank",
  image: "image",
  ocr: "ocr",
  metadata: "metadata",
  structure: "structure"
};

export interface ModelArtifact {
  name: string;
  filename: string;
  url: string;
  role: ModelRoleKind;
  description?: string;
  sizeHintMB?: number;
  sha256?: string;
  envOverride?: string;
}

export interface ModelStatus extends ModelArtifact {
  present: boolean;
  sizeBytes?: number;
  fullPath: string;
  relativePath: string;
}

export const modelManifest: ModelArtifact[] = [
  {
    name: "bge-m3",
    filename: "bge-m3.onnx",
    url: "https://huggingface.co/BAAI/bge-m3/resolve/main/onnx/model.onnx?download=1",
    role: "text",
    sizeHintMB: 1600,
    envOverride: "BGE_M3_URL",
    description: "文本嵌入模型（Xenova/BAAI bge-m3）"
  },
  {
    name: "bge-reranker-v2",
    filename: "bge-reranker-v2.onnx",
    url: "https://huggingface.co/onnx-community/bge-reranker-v2-m3-ONNX/resolve/main/onnx/model_fp16.onnx",
    role: "rerank",
    sizeHintMB: 1140,
    envOverride: "BGE_RERANKER_URL",
    description: "Cross-Encoder Rerank 模型"
  },
  {
    name: "openclip-vit-b-32",
    filename: "openclip-vitb32.onnx",
    url: "https://huggingface.co/sayantan47/clip-vit-b32-onnx/resolve/main/onnx/model.onnx?download=1",
    role: "image",
    sizeHintMB: 606,
    envOverride: "OPENCLIP_URL",
    description: "OpenCLIP 图像嵌入模型"
  },
  {
    name: "paddle-ocr-chi",
    filename: "paddle-ocr-chi.tar.gz",
    url: "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar",
    role: "ocr",
    sizeHintMB: 450,
    description: "PaddleOCR 中文识别模型"
  }
];

const HUGGINGFACE_TOKEN = process.env.HF_TOKEN ?? process.env.HUGGINGFACE_TOKEN;

function buildHeaders(url: string) {
  const headers: Record<string, string> = {};
  if (HUGGINGFACE_TOKEN && url.includes("huggingface.co")) {
    headers.Authorization = `Bearer ${HUGGINGFACE_TOKEN}`;
  }
  return headers;
}

async function downloadFile(url: string, destination: string) {
  const response = await fetch(url, { headers: buildHeaders(url) });
  if (!response.ok || !response.body) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(destination));
}

async function hashFile(path: string) {
  return new Promise<string>((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function resolveRoleDir(baseDir: string, role: ModelRoleKind) {
  const dir = ROLE_DIR_MAP[role] ?? role;
  return resolve(baseDir, dir);
}

function targetPath(baseDir: string, artifact: ModelArtifact) {
  return resolve(resolveRoleDir(baseDir, artifact.role), artifact.filename);
}

function legacyPath(baseDir: string, artifact: ModelArtifact) {
  return resolve(baseDir, artifact.filename);
}

function ensureDirForArtifact(baseDir: string, artifact: ModelArtifact) {
  mkdirSync(resolveRoleDir(baseDir, artifact.role), { recursive: true });
}

function migrateLegacyArtifact(baseDir: string, artifact: ModelArtifact) {
  const legacy = legacyPath(baseDir, artifact);
  const target = targetPath(baseDir, artifact);
  if (existsSync(legacy) && !existsSync(target)) {
    ensureDirForArtifact(baseDir, artifact);
    renameSync(legacy, target);
  }
}

export async function ensureModelArtifact(baseDir: string, artifact: ModelArtifact): Promise<void> {
  ensureDirForArtifact(baseDir, artifact);
  const sourceUrl = artifact.envOverride ? process.env[artifact.envOverride] ?? artifact.url : artifact.url;
  migrateLegacyArtifact(baseDir, artifact);
  const target = targetPath(baseDir, artifact);
  if (!existsSync(target)) {
    await downloadFile(sourceUrl, target);
  }
  if (artifact.sha256) {
    const digest = await hashFile(target);
    if (digest !== artifact.sha256) {
      throw new Error(`Checksum mismatch for ${artifact.name}`);
    }
  }
}

function resolveRelative(baseDir: string, absolute: string) {
  return relative(baseDir, absolute);
}

export function listModelStatuses(baseDir: string): ModelStatus[] {
  return modelManifest.map((artifact) => {
    migrateLegacyArtifact(baseDir, artifact);
    const fullPath = targetPath(baseDir, artifact);
    const legacy = legacyPath(baseDir, artifact);
    const present = existsSync(fullPath) || existsSync(legacy);
    const actualPath = existsSync(fullPath) ? fullPath : legacy;
    const sizeBytes = present ? statSync(actualPath).size : undefined;
    const relativePath = present ? resolveRelative(baseDir, actualPath) : resolveRelative(baseDir, fullPath);
    return {
      ...artifact,
      present,
      sizeBytes,
      fullPath: actualPath,
      relativePath
    };
  });
}

export interface ExtraModelFile {
  filename: string;
  sizeBytes: number;
  mtimeMs: number;
  role: ModelRoleKind;
  fullPath: string;
  relativePath: string;
}

export function listExtraModelFiles(baseDir: string): ExtraModelFile[] {
  const extras: ExtraModelFile[] = [];
  for (const [role, dirName] of Object.entries(ROLE_DIR_MAP) as Array<[ModelRoleKind, string]>) {
    const roleDir = resolve(baseDir, dirName);
    if (!existsSync(roleDir)) {
      continue;
    }
    for (const filename of readdirSync(roleDir)) {
      const isManifestEntry = modelManifest.some(
        (artifact) => artifact.role === role && artifact.filename === filename
      );
      if (isManifestEntry) {
        continue;
      }
      const fullPath = resolve(roleDir, filename);
      const stats = statSync(fullPath);
      extras.push({
        filename,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs,
        role,
        fullPath,
        relativePath: resolveRelative(baseDir, fullPath)
      });
    }
  }
  return extras;
}

export function findArtifact(identifier: string): ModelArtifact | undefined {
  return modelManifest.find(
    (artifact) => artifact.name === identifier || artifact.filename === identifier
  );
}

function normalizeLocalReference(baseDir: string, input?: string): string | undefined {
  if (!input) {
    return undefined;
  }
  const stripped = input.startsWith("local://") ? input.slice("local://".length) : input;
  const candidate = isAbsolute(stripped) ? stripped : resolve(baseDir, stripped);
  return existsSync(candidate) ? candidate : undefined;
}

export function resolveLocalModelId(
  role: ModelRoleKind,
  baseDir: string,
  preferred?: string
): string | undefined {
  const preferredPath = normalizeLocalReference(baseDir, preferred);
  if (preferredPath) {
    return preferredPath;
  }
  const manifestHit = listModelStatuses(baseDir).find(
    (status) => status.role === role && status.present
  );
  if (manifestHit) {
    return manifestHit.fullPath;
  }
  const extras = listExtraModelFiles(baseDir).find((extra) => extra.role === role);
  if (extras) {
    return extras.fullPath;
  }
  return undefined;
}

export function relativeModelReference(baseDir: string, absolutePath: string): string {
  return absolutePath.startsWith("local://") ? absolutePath : relative(baseDir, absolutePath);
}
