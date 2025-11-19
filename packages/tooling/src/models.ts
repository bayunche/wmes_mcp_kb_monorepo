import { createReadStream, createWriteStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";

export interface ModelArtifact {
  name: string;
  filename: string;
  url: string;
  description?: string;
  sizeHintMB?: number;
  sha256?: string;
  envOverride?: string;
}

export interface ModelStatus extends ModelArtifact {
  present: boolean;
  sizeBytes?: number;
  fullPath: string;
}

export const modelManifest: ModelArtifact[] = [
  {
    name: "bge-m3",
    filename: "bge-m3.onnx",
    url: "https://huggingface.co/BAAI/bge-m3/resolve/main/onnx/model.onnx?download=1",
    sizeHintMB: 1600,
    envOverride: "BGE_M3_URL",
    description: "文本嵌入模型（Xenova/BAAI bge-m3）"
  },
  {
    name: "bge-reranker-v2",
    filename: "bge-reranker-v2.onnx",
    url: "https://huggingface.co/onnx-community/bge-reranker-v2-m3-ONNX/resolve/main/onnx/model_fp16.onnx",
    sizeHintMB: 1140,
    envOverride: "BGE_RERANKER_URL",
    description: "Cross-Encoder Rerank 模型"
  },
  {
    name: "openclip-vit-b-32",
    filename: "openclip-vitb32.onnx",
    url: "https://huggingface.co/sayantan47/clip-vit-b32-onnx/resolve/main/onnx/model.onnx?download=1",
    sizeHintMB: 606,
    envOverride: "OPENCLIP_URL",
    description: "OpenCLIP 图像嵌入模型"
  },
  {
    name: "paddle-ocr-chi",
    filename: "paddle-ocr-chi.tar.gz",
    url: "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar",
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

export async function ensureModelArtifact(baseDir: string, artifact: ModelArtifact): Promise<void> {
  mkdirSync(baseDir, { recursive: true });
  const target = resolve(baseDir, artifact.filename);
  const sourceUrl = artifact.envOverride ? process.env[artifact.envOverride] ?? artifact.url : artifact.url;

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

export function listModelStatuses(baseDir: string): ModelStatus[] {
  return modelManifest.map((artifact) => {
    const fullPath = resolve(baseDir, artifact.filename);
    const present = existsSync(fullPath);
    const sizeBytes = present ? statSync(fullPath).size : undefined;
    return {
      ...artifact,
      present,
      sizeBytes,
      fullPath
    };
  });
}

export interface ExtraModelFile {
  filename: string;
  sizeBytes: number;
  mtimeMs: number;
}

export function listExtraModelFiles(baseDir: string): ExtraModelFile[] {
  if (!existsSync(baseDir)) {
    return [];
  }
  const manifestFilenames = new Set(modelManifest.map((artifact) => artifact.filename));
  return readdirSync(baseDir)
    .filter((filename) => !manifestFilenames.has(filename))
    .map((filename) => {
      const stats = statSync(join(baseDir, filename));
      return {
        filename,
        sizeBytes: stats.size,
        mtimeMs: stats.mtimeMs
      };
    });
}

export function findArtifact(identifier: string): ModelArtifact | undefined {
  return modelManifest.find(
    (artifact) => artifact.name === identifier || artifact.filename === identifier
  );
}
