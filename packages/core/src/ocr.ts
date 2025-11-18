import type { ParsedElement } from "./parsing";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execCallback);

export interface OcrRequest {
  buffer?: Uint8Array;
  filePath?: string;
  mimeType?: string;
  filename?: string;
  language?: string;
}

export interface OcrAdapter {
  extract(input: OcrRequest): Promise<ParsedElement[]>;
}

export interface HttpOcrAdapterOptions {
  endpoint: string;
  apiKey?: string;
  timeoutMs?: number;
  language?: string;
}

export class HttpOcrAdapter implements OcrAdapter {
  constructor(private readonly options: HttpOcrAdapterOptions) {}

  async extract(input: OcrRequest): Promise<ParsedElement[]> {
    if (!input.buffer || !input.buffer.length) {
      return [];
    }
    const form = new FormData();
    const blob = new Blob([input.buffer], {
      type: input.mimeType ?? "application/octet-stream"
    });
    form.append("file", blob, input.filename ?? "document.bin");
    form.append("response_format", "json");
    form.append("language", input.language ?? this.options.language ?? "chi_sim");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60000);
    try {
      const response = await fetch(this.options.endpoint, {
        method: "POST",
        headers: {
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {})
        },
        body: form,
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`OCR request failed (${response.status})`);
      }
      const payload = await response.json();
      return normalizeOcrPayload(payload);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export interface LocalOcrAdapterOptions {
  command: string;
  timeoutMs?: number;
  language?: string;
  workdir?: string;
}

export class LocalOcrAdapter implements OcrAdapter {
  constructor(private readonly options: LocalOcrAdapterOptions) {}

  async extract(input: OcrRequest): Promise<ParsedElement[]> {
    const filePath = input.filePath ?? (await this.persistTempFile(input));
    if (!filePath) return [];
    const lang = input.language ?? this.options.language ?? "chi_sim";
    const command = buildCommand(this.options.command, filePath, lang);
    try {
      const { stdout } = await execAsync(command, {
        cwd: this.options.workdir,
        timeout: this.options.timeoutMs ?? 60000
      });
      const payload = deserializePayload(stdout.trim());
      return normalizeOcrPayload(payload);
    } finally {
      if (!input.filePath) {
        await safeUnlink(filePath);
      }
    }
  }

  private async persistTempFile(input: OcrRequest) {
    if (!input.buffer || !input.buffer.length) {
      return undefined;
    }
    const dir = await mkdtemp(join(tmpdir(), "kb-ocr-"));
    const filename = input.filename ?? `source-${Date.now()}`;
    const fullPath = join(dir, filename);
    await fs.writeFile(fullPath, input.buffer);
    return fullPath;
  }
}

function normalizeOcrPayload(payload: unknown): ParsedElement[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload.flatMap((item, index) => mapToElement(item, index));
  }
  if (typeof payload === "object" && (payload as { elements?: unknown }).elements) {
    const list = (payload as { elements: unknown[] }).elements;
    if (Array.isArray(list)) {
      return list.flatMap((item, index) => mapToElement(item, index));
    }
  }
  if (typeof payload === "object" && (payload as { text?: string }).text) {
    return mapToElement(payload, 0);
  }
  if (typeof payload === "string") {
    return [
      {
        id: crypto.randomUUID(),
        type: "text",
        text: payload
      }
    ];
  }
  return [];
}

function mapToElement(item: unknown, index: number): ParsedElement[] {
  if (!item || typeof item !== "object") {
    return [];
  }
  const record = item as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : undefined;
  if (!text || !text.trim().length) {
    return [];
  }
  return [
    {
      id: (record.id as string) ?? crypto.randomUUID(),
      type: (record.type as ParsedElement["type"]) ?? "text",
      text: text.trim(),
      page: typeof record.page === "number" ? record.page : undefined,
      bbox: Array.isArray(record.bbox) ? (record.bbox as number[]) : undefined,
      metadata: {
        ...(typeof record.confidence === "number" ? { confidence: record.confidence } : {}),
        ...(Array.isArray(record.labels) ? { labels: record.labels } : {}),
        ocr: true
      }
    }
  ];
}

export function shouldUseOcr(mimeType?: string | null, filename?: string | null) {
  const normalized = mimeType?.toLowerCase();
  if (normalized) {
    if (normalized.includes("pdf") || normalized.startsWith("image/")) {
      return true;
    }
    if (
      normalized.includes("application/msword") ||
      normalized.includes("application/vnd.ms-powerpoint") ||
      normalized.includes("application/vnd.ms-excel")
    ) {
      return true;
    }
  }
  if (!normalized || normalized === "application/octet-stream") {
    const lower = filename?.toLowerCase() ?? "";
    if (/\.(doc|ppt|xls|dot|pps)$/.test(lower)) {
      return true;
    }
  }
  return false;
}

function buildCommand(template: string, filePath: string, language: string) {
  return template
    .replace(/\{\{\s*file\s*\}\}/gi, JSON.stringify(filePath).slice(1, -1))
    .replace(/\{\{\s*lang\s*\}\}/gi, language);
}

function deserializePayload(stdout: string) {
  if (!stdout.trim().length) {
    return [];
  }
  const fenced = stdout.match(/```(?:json)?([\s\S]*?)```/i);
  const content = fenced ? fenced[1].trim() : stdout.trim();
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

async function safeUnlink(path: string) {
  try {
    await fs.rm(path, { force: true });
    const parent = dirname(path);
    if (parent.includes("kb-ocr-")) {
      await fs.rm(parent, { force: true, recursive: true });
    }
  } catch {
    // ignore
  }
}
