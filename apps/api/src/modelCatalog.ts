import { promises as fs } from "node:fs";
import type { ModelRole } from "@kb/shared-schemas";

export interface ModelCatalogProvider {
  provider: string;
  driver: "local" | "remote";
  defaultBaseUrl?: string;
  models: Array<{
    modelName: string;
    displayName: string;
    roles: ModelRole[];
  }>;
}

const DEFAULT_MODEL_CATALOG: ModelCatalogProvider[] = [
  {
    provider: "ollama",
    driver: "local",
    defaultBaseUrl: "http://localhost:11434/api/generate",
    models: [
      { modelName: "nomic-embed-text", displayName: "Nomic Embed Text", roles: ["embedding"] },
      { modelName: "llama3.1", displayName: "Llama 3.1", roles: ["metadata", "tagging", "structure"] },
      { modelName: "llava:13b", displayName: "LLaVA Caption", roles: ["ocr"] }
    ]
  },
  {
    provider: "openai",
    driver: "remote",
    defaultBaseUrl: "https://api.openai.com/v1/chat/completions",
    models: [
      { modelName: "gpt-4o-mini", displayName: "GPT-4o mini", roles: ["metadata", "tagging", "structure"] },
      { modelName: "text-embedding-3-large", displayName: "text-embedding-3-large", roles: ["embedding"] },
      { modelName: "gpt-4o-mini-vision", displayName: "GPT-4o Vision", roles: ["ocr"] },
      { modelName: "gpt-4o-mini", displayName: "GPT-4o mini", roles: ["rerank"] }
    ]
  }
];

export async function loadModelCatalog(): Promise<ModelCatalogProvider[]> {
  const overridePath = process.env.MODEL_CATALOG_PATH;
  if (!overridePath) {
    return DEFAULT_MODEL_CATALOG;
  }
  try {
    const raw = await fs.readFile(overridePath, "utf8");
    const parsed = JSON.parse(raw) as ModelCatalogProvider[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (error) {
    console.error(`Failed to read MODEL_CATALOG_PATH: ${(error as Error).message}`);
  }
  return DEFAULT_MODEL_CATALOG;
}
