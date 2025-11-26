import type { ParsedElement } from "./parsing";
import { promises as fs } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { exec as execCallback } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(execCallback);

function sanitizeText(input: string): string {
  if (!input) return "";
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

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
  encoding?: string;
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
    const timeoutMs = this.options.timeoutMs ?? 60000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
        const body = await response.text().catch(() => "");
        const tail = body ? `: ${body}` : "";
        throw new Error(`OCR request failed (${response.status})${tail}`);
      }
      const payload = await response.json();
      return normalizeOcrPayload(payload);
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        throw new Error(
          `OCR request to ${this.options.endpoint} timed out after ${timeoutMs}ms`
        );
      }
      throw new Error(
        `OCR request to ${this.options.endpoint} failed: ${(error as Error).message}`
      );
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
  encoding?: BufferEncoding;
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
        timeout: this.options.timeoutMs ?? 60000,
        encoding: this.options.encoding ?? "utf8"
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
  // Paddle server.py 返回 {"text": "...", "lines": [...]}
  if (typeof payload === "object" && (payload as { text?: string; lines?: unknown[] }).text) {
    const body = payload as { text?: string; lines?: unknown[] };
    const lines = Array.isArray(body.lines) ? body.lines.filter((v) => typeof v === "string") as string[] : [];
    if (lines.length) {
      return lines.map((line, idx) => ({
        id: crypto.randomUUID(),
        type: "text",
        text: sanitizeText(line),
        metadata: { lineIndex: idx, ocr: true }
      }));
    }
    if (typeof body.text === "string" && body.text.trim().length) {
      return [
        {
          id: crypto.randomUUID(),
          type: "text",
          text: sanitizeText(body.text).trim(),
          metadata: { ocr: true }
        }
      ];
    }
  }
  if (Array.isArray(payload) && payload.some(isPaddleArrayLike)) {
    return payload.flatMap((item, index) => mapPaddleArray(item, index));
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
  const clean = sanitizeText(text);
  return [
    {
      id: (record.id as string) ?? crypto.randomUUID(),
      type: (record.type as ParsedElement["type"]) ?? "text",
      text: clean.trim(),
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

function isPaddleArrayLike(item: unknown): boolean {
  if (!Array.isArray(item) || item.length < 2) return false;
  const meta = item[1];
  return Array.isArray(meta) && typeof meta[0] === "string";
}

function mapPaddleArray(item: unknown, index: number): ParsedElement[] {
  if (!Array.isArray(item) || item.length < 2) return [];
  const meta = item[1];
  if (!Array.isArray(meta) || typeof meta[0] !== "string") return [];
  const text = sanitizeText(meta[0] as string);
  const confidence = typeof meta[1] === "number" ? meta[1] : undefined;
  const bbox =
    Array.isArray(item[0]) && Array.isArray(item[0][0])
      ? (item[0] as number[][]).flat()
      : undefined;
  return [
    {
      id: crypto.randomUUID(),
      type: "text",
      text: text.trim(),
      bbox,
      metadata: {
        ...(confidence !== undefined ? { confidence } : {}),
        ocr: true
      }
    }
  ];
}

export function shouldUseOcr(mimeType?: string | null, filename?: string | null) {
  const normalized = mimeType?.toLowerCase();
  if (normalized) {
    // 仅对 PDF 启用 OCR；图片文件走图像嵌入，Office 文档走解析器
    if (normalized.includes("pdf")) {
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
