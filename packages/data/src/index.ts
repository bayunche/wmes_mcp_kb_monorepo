import type { AppConfig } from "@kb/core/src/config";
import { createDbClient } from "./db/client";
import { PgDocumentRepository } from "./repositories/documents";
import { PgChunkRepository } from "./repositories/chunks";
import { PgKnowledgeWriter } from "./repositories/knowledge";
import { QdrantVectorIndex } from "./qdrant/client";
import { RabbitQueueAdapter } from "./queue/rabbitmq";
import { MinioStorageClient } from "./storage/minio";
import { PgAttachmentRepository } from "./repositories/attachments";
import type { DataLayer } from "./types";

export interface DataLayerOptions {
  qdrantCollection?: string;
  queueName?: string;
}

export function createDataLayer(config: AppConfig, options: DataLayerOptions = {}): DataLayer {
  const { db, destroy } = createDbClient(config);
  const vectorIndex = new QdrantVectorIndex({
    url: config.QDRANT_URL,
    collection: options.qdrantCollection ?? "knowledge_text"
  });
  const documents = new PgDocumentRepository(db);
  const chunks = new PgChunkRepository(db, vectorIndex);
  const knowledgeWriter = new PgKnowledgeWriter(db, vectorIndex);
  const queue = new RabbitQueueAdapter(config, { queueName: options.queueName });
  const storage = new MinioStorageClient(
    config.MINIO_ENDPOINT,
    config.MINIO_ACCESS_KEY,
    config.MINIO_SECRET_KEY,
    {
      rawBucket: config.MINIO_BUCKET_RAW,
      previewBucket: config.MINIO_BUCKET_PREVIEW
    }
  );
  const attachments = new PgAttachmentRepository(db);

  return {
    documents,
    chunks,
    knowledgeWriter,
    queue,
    vectorIndex,
    attachments,
    storage,
    async close() {
      await destroy();
    }
  };
}

export * from "./types";
export { QdrantVectorIndex } from "./qdrant/client";
export { RabbitQueueAdapter } from "./queue/rabbitmq";
export { MinioStorageClient } from "./storage/minio";
export { PgAttachmentRepository } from "./repositories/attachments";
