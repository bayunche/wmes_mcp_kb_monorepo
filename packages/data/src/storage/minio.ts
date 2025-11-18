import { Client } from "minio";
import { Buffer } from "node:buffer";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promises as fs } from "node:fs";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import type { RawObjectHandle, RawObjectOptions } from "../types";

export interface MinioStorageOptions {
  rawBucket: string;
  previewBucket: string;
}

export class MinioStorageClient {
  private readonly client: Client;

  constructor(
    endpoint: string,
    accessKey: string,
    secretKey: string,
    private readonly options: MinioStorageOptions
  ) {
    const url = new URL(endpoint);
    this.client = new Client({
      endPoint: url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
      useSSL: url.protocol === "https:",
      accessKey,
      secretKey
    });
  }

  async getRawObject(objectKey: string, options?: RawObjectOptions): Promise<RawObjectHandle> {
    const stat = await this.client
      .statObject(this.options.rawBucket, objectKey)
      .catch(() => undefined);
    const contentType = stat?.metaData?.["content-type"] ?? stat?.metaData?.["Content-Type"];
    const size = typeof stat?.size === "number" ? Number(stat?.size) : undefined;
    const threshold = options?.maxInMemoryBytes ?? 64 * 1024 * 1024;

    if (typeof size === "number" && size > threshold) {
      return this.streamObjectToFile(this.options.rawBucket, objectKey, size, contentType);
    }

    const data = await this.getObjectBuffer(this.options.rawBucket, objectKey);
    return {
      type: "buffer",
      data,
      size: size ?? data.byteLength,
      mimeType: contentType
    };
  }

  async putRawObject(objectKey: string, payload: Buffer | Uint8Array | string, contentType?: string) {
    if (typeof payload === "string") {
      await this.client.fPutObject(
        this.options.rawBucket,
        objectKey,
        payload,
        undefined,
        { "Content-Type": contentType ?? "application/octet-stream" }
      );
      return objectKey;
    }
    await this.putObject(this.options.rawBucket, objectKey, payload, contentType);
    return objectKey;
  }

  async putPreviewObject(objectKey: string, payload: Buffer | Uint8Array, contentType?: string) {
    await this.putObject(this.options.previewBucket, objectKey, payload, contentType);
    return objectKey;
  }

  async deleteRawObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.options.rawBucket, objectKey).catch(() => undefined);
  }

  async deletePreviewObject(objectKey: string): Promise<void> {
    await this.client.removeObject(this.options.previewBucket, objectKey).catch(() => undefined);
  }

  async deletePreviewPrefix(prefix: string): Promise<void> {
    const objectsStream = this.client.listObjects(this.options.previewBucket, prefix, true);
    const deletions: Array<Promise<void>> = [];
    await new Promise<void>((resolve, reject) => {
      objectsStream.on("data", (obj) => {
        if (obj.name) {
          deletions.push(this.client.removeObject(this.options.previewBucket, obj.name).catch(() => undefined));
        }
      });
      objectsStream.on("error", reject);
      objectsStream.on("end", resolve);
    });
    if (deletions.length) {
      await Promise.allSettled(deletions);
    }
  }

  private async getObjectBuffer(bucket: string, objectKey: string): Promise<Uint8Array> {
    const stream = await this.client.getObject(bucket, objectKey);
    const chunks: Buffer[] = [];
    return await new Promise<Uint8Array>((resolve, reject) => {
      stream.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  }

  private async streamObjectToFile(
    bucket: string,
    objectKey: string,
    size: number,
    mimeType?: string
  ): Promise<RawObjectHandle> {
    const dir = await fs.mkdtemp(join(tmpdir(), "kb-raw-"));
    const filePath = join(dir, `${randomUUID()}-${objectKey.split("/").pop() ?? "object"}`);
    const stream = await this.client.getObject(bucket, objectKey);
    await new Promise<void>((resolve, reject) => {
      const writable = createWriteStream(filePath);
      stream.pipe(writable);
      stream.on("error", reject);
      writable.on("error", reject);
      writable.on("finish", () => resolve());
    });
    const cleanup = async () => {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    };
    return {
      type: "file",
      path: filePath,
      size,
      mimeType,
      cleanup
    };
  }

  private async putObject(
    bucket: string,
    objectKey: string,
    payload: Buffer | Uint8Array,
    contentType?: string
  ) {
    await this.client.putObject(bucket, objectKey, payload, undefined, {
      "Content-Type": contentType ?? "application/octet-stream"
    });
  }
}
