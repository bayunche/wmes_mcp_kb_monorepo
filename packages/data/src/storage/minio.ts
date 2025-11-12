import { Client } from "minio";
import { Buffer } from "node:buffer";

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

  async getRawObject(objectKey: string): Promise<Uint8Array> {
    return this.getObject(this.options.rawBucket, objectKey);
  }

  async putRawObject(objectKey: string, payload: Buffer | Uint8Array, contentType?: string) {
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

  private async getObject(bucket: string, objectKey: string): Promise<Uint8Array> {
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
