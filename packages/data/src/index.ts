import type { AppConfig } from "@kb/core/src/config";
import { createDbClient } from "./db/client";
import { PgDocumentRepository } from "./repositories/documents";
import { PgChunkRepository } from "./repositories/chunks";
import { PgKnowledgeWriter } from "./repositories/knowledge";
import { QdrantVectorIndex } from "./qdrant/client";
import { RabbitQueueAdapter } from "./queue/rabbitmq";
import { MinioStorageClient } from "./storage/minio";
import { PgAttachmentRepository } from "./repositories/attachments";
import { PgModelSettingsRepository } from "./repositories/modelSettings";
import { PgVectorLogRepository } from "./repositories/vectorLogs";
import { PgTenantConfigRepository, PgLibraryConfigRepository } from "./repositories/orgConfigs";
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
  const modelSettings = new PgModelSettingsRepository(db);
  const vectorLogs = new PgVectorLogRepository(db);
  const tenantConfigs = new PgTenantConfigRepository(db);
  const libraryConfigs = new PgLibraryConfigRepository(db);

  return {
    documents,
    chunks,
    knowledgeWriter,
    queue,
    vectorIndex,
    attachments,
    modelSettings,
    vectorLogs,
    tenantConfigs,
    libraryConfigs,
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
export { PgTenantConfigRepository, PgLibraryConfigRepository } from "./repositories/orgConfigs";
