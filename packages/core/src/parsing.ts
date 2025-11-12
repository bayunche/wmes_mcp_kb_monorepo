import { randomUUID } from "node:crypto";
import { TextDecoder } from "node:util";
import { Buffer } from "node:buffer";
import { Chunk, ChunkSchema, Document } from "@kb/shared-schemas";

const decoder = new TextDecoder();

export type ParsedElementType = "text" | "table" | "image" | "caption";

export interface ParsedElement {
  id: string;
  type: ParsedElementType;
  text?: string;
  page?: number;
  bbox?: number[];
  metadata?: Record<string, unknown>;
  mimeType?: string;
  data?: Uint8Array;
  structuredData?: unknown;
}

export interface ParserInput {
  buffer?: Uint8Array;
  rawText?: string;
  mimeType?: string;
  filename?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentParser {
  parse(input: ParserInput): Promise<ParsedElement[]>;
}

export class BasicTextParser implements DocumentParser {
  async parse(input: ParserInput): Promise<ParsedElement[]> {
    const text = this.resolveText(input);
    if (!text?.trim()) {
      return [];
    }
    const paragraphs = splitParagraphs(text);
    return paragraphs.map((paragraph, index) => ({
      id: randomUUID(),
      type: "text",
      text: paragraph,
      metadata: {
        sectionTitle: input.metadata?.title ?? undefined,
        paragraphIndex: index
      }
    }));
  }

  private resolveText(input: ParserInput) {
    if (input.rawText?.length) {
      return input.rawText;
    }
    if (input.buffer?.length) {
      return decoder.decode(input.buffer);
    }
    return undefined;
  }
}

export interface UnstructuredParserOptions {
  url: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class UnstructuredParser implements DocumentParser {
  constructor(private readonly options: UnstructuredParserOptions) {}

  async parse(input: ParserInput): Promise<ParsedElement[]> {
    const body = this.buildFormData(input);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 30000);
    try {
      const response = await fetch(this.options.url, {
        method: "POST",
        headers: {
          ...(this.options.apiKey ? { Authorization: `Bearer ${this.options.apiKey}` } : {})
        },
        body,
        signal: controller.signal
      });
      if (!response.ok) {
        const reason = await safeText(response);
        throw new Error(`Unstructured parser failed (${response.status}): ${reason}`);
      }
      const payload = (await response.json()) as unknown;
      if (!Array.isArray(payload)) {
        return [];
      }
      return payload.map((element) => mapUnstructuredElement(element));
    } catch (error) {
      throw new Error(
        error instanceof Error ? error.message : "Unknown error when calling Unstructured API"
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildFormData(input: ParserInput) {
    const form = new FormData();
    if (input.buffer?.length) {
      const blob = new Blob([input.buffer], { type: input.mimeType ?? "application/octet-stream" });
      form.append("files", blob, input.filename ?? "document.bin");
    } else if (input.rawText) {
      form.append("text", input.rawText);
    }
    form.append("strategy", "hi_res");
    form.append("output_format", "application/json");
    return form;
  }
}

export class CompositeParser implements DocumentParser {
  constructor(private readonly parsers: DocumentParser[]) {}

  async parse(input: ParserInput): Promise<ParsedElement[]> {
    for (const parser of this.parsers) {
      try {
        const result = await parser.parse(input);
        if (result.length) {
          return result;
        }
      } catch {
        continue;
      }
    }
    return [];
  }
}

export interface ChunkFragment {
  chunk: Chunk;
  source: ParsedElement;
}

export interface ChunkFactory {
  createChunks(doc: Document, elements: ParsedElement[]): ChunkFragment[];
}

export class SimpleChunkFactory implements ChunkFactory {
  createChunks(doc: Document, elements: ParsedElement[]): ChunkFragment[] {
    return elements.map((element, index) => {
      const chunk = ChunkSchema.parse({
        chunkId: element.id ?? randomUUID(),
        docId: doc.docId,
        hierPath: buildHierarchy(doc, element, index),
        sectionTitle: deriveSectionTitle(element, index),
        contentText: element.text,
        contentType: mapElementType(element.type),
        pageNo: element.page,
        bbox: element.bbox,
        topicLabels: deriveTopics(element)
      });
      return { chunk, source: element };
    });
  }
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function buildHierarchy(doc: Document, element: ParsedElement, index: number) {
  const title = deriveSectionTitle(element, index);
  return [doc.title, title];
}

function deriveSectionTitle(element: ParsedElement, index: number) {
  const explicit =
    (element.metadata?.heading as string | undefined) ??
    (element.metadata?.sectionTitle as string | undefined);
  if (explicit) {
    return explicit;
  }
  switch (element.type) {
    case "table":
      return `表格 ${index + 1}`;
    case "image":
      return `图片 ${index + 1}`;
    case "caption":
      return `图片说明 ${index + 1}`;
    default:
      return `段落 ${index + 1}`;
  }
}

function deriveTopics(element: ParsedElement) {
  const labels = element.metadata?.topics;
  if (Array.isArray(labels)) {
    return labels.map((label) => String(label));
  }
  return undefined;
}

function mapElementType(type: ParsedElementType): Chunk["contentType"] {
  if (type === "table") return "table";
  if (type === "image") return "image";
  if (type === "caption") return "caption";
  return "text";
}

function mapUnstructuredElement(element: unknown): ParsedElement {
  const raw = element as {
    id?: string;
    type?: string;
    text?: string;
    metadata?: Record<string, unknown>;
    data?: string;
  };
  const buffer = extractBinary(raw);
  return {
    id: raw.id ?? randomUUID(),
    type: mapUnstructuredType(raw.type),
    text: raw.text ?? (raw.metadata?.text as string | undefined),
    page: (raw.metadata?.page_number as number | undefined) ?? undefined,
    bbox: extractBbox(raw.metadata),
    metadata: raw.metadata,
    mimeType: (raw.metadata?.mime_type as string | undefined) ?? undefined,
    data: buffer,
    structuredData: raw.metadata?.table ?? raw.metadata?.text_as_html ?? raw.metadata?.structured_data
  };
}

function mapUnstructuredType(value?: string): ParsedElementType {
  switch ((value ?? "").toLowerCase()) {
    case "table":
      return "table";
    case "figure":
    case "image":
      return "image";
    case "caption":
      return "caption";
    default:
      return "text";
  }
}

function extractBinary(raw: { data?: string; metadata?: Record<string, unknown> }) {
  const candidate =
    raw.data ??
    (raw.metadata?.image_base64 as string | undefined) ??
    (raw.metadata?.binary_data as string | undefined);
  if (!candidate) {
    return undefined;
  }
  try {
    return Buffer.from(candidate, "base64");
  } catch {
    return undefined;
  }
}

function extractBbox(metadata?: Record<string, unknown>) {
  const coords = metadata?.coordinates;
  if (!coords || typeof coords !== "object") {
    return undefined;
  }
  const values = (coords as { points?: Array<{ x: number; y: number }> }).points;
  if (!Array.isArray(values) || values.length < 2) {
    return undefined;
  }
  const [p1, p2] = values;
  if (typeof p1?.x !== "number" || typeof p1?.y !== "number" || typeof p2?.x !== "number" || typeof p2?.y !== "number") {
    return undefined;
  }
  return [p1.x, p1.y, p2.x, p2.y];
}

async function safeText(response: Response) {
  try {
    return await response.text();
  } catch {
    return "";
  }
}
