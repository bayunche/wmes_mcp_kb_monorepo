import { mkdirSync, existsSync, createWriteStream, createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { loadConfig } from "../../packages/core/src/config";

type ModelArtifact = {
  name: string;
  filename: string;
  url: string;
  sha256?: string;
  sizeHintMB?: number;
  envOverride?: string;
};

const manifest: ModelArtifact[] = [
  {
    name: "bge-m3",
    filename: "bge-m3.onnx",
    url: "https://huggingface.co/BAAI/bge-m3/resolve/main/onnx/model.onnx?download=1",
    sizeHintMB: 1_600,
    envOverride: "BGE_M3_URL"
  },
  {
    name: "bge-reranker-v2",
    filename: "bge-reranker-v2.onnx",
    url: "https://huggingface.co/onnx-community/bge-reranker-v2-m3-ONNX/resolve/main/onnx/model_fp16.onnx",
    sizeHintMB: 1_140,
    envOverride: "BGE_RERANKER_URL"
  },
  {
    name: "openclip-vit-b-32",
    filename: "openclip-vitb32.onnx",
    url: "https://huggingface.co/sayantan47/clip-vit-b32-onnx/resolve/main/onnx/model.onnx?download=1",
    sizeHintMB: 606,
    envOverride: "OPENCLIP_URL"
  },
  {
    name: "paddle-ocr-chi",
    filename: "paddle-ocr-chi.tar.gz",
    url: "https://paddleocr.bj.bcebos.com/PP-OCRv4/chinese/ch_PP-OCRv4_rec_infer.tar",
    sizeHintMB: 450
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
  console.log(`Downloading ${url}`);
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

async function ensureArtifact(baseDir: string, artifact: ModelArtifact) {
  const target = resolve(baseDir, artifact.filename);
  const sourceUrl = artifact.envOverride ? process.env[artifact.envOverride] ?? artifact.url : artifact.url;

  if (!existsSync(target)) {
    await downloadFile(sourceUrl, target);
    console.log(`Downloaded ${artifact.name} (${artifact.sizeHintMB ?? "?"} MB).`);
  } else {
    console.log(`✔ ${artifact.name} already present (${artifact.filename}).`);
  }

  if (artifact.sha256) {
    const digest = await hashFile(target);
    if (digest !== artifact.sha256) {
      throw new Error(`Checksum mismatch for ${artifact.name}`);
    }
    console.log(`Checksum verified for ${artifact.name}.`);
  }
}

async function main() {
  const cfg = loadConfig({ envFile: process.env.ENV_FILE ?? ".env" });
  mkdirSync(cfg.MODELS_DIR, { recursive: true });

  for (const artifact of manifest) {
    try {
      await ensureArtifact(cfg.MODELS_DIR, artifact);
    } catch (error) {
      console.warn(`⚠ Failed to sync ${artifact.name}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log("Model sync completed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
