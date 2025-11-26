import { connect, Connection, Channel, ConsumeMessage } from "amqplib";
import type { IngestionTask } from "@kb/shared-schemas";
import type { QueueAdapter } from "../types";
import type { AppConfig } from "@kb/core/src/config";

export interface RabbitQueueOptions {
  queueName?: string;
}

export class RabbitQueueAdapter implements QueueAdapter {
  private connection?: Connection;
  private channel?: Channel;
  private consuming = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private lastHandler?: (task: IngestionTask) => Promise<void>;

  constructor(private readonly config: AppConfig, private readonly options: RabbitQueueOptions = {}) {}

  private async getChannel() {
    if (!this.connection) {
      this.connection = await connect(this.config.RABBITMQ_URL, {
        heartbeat: 30,
        clientProperties: { connection_name: "kb-worker" }
      });
      this.connection.on("close", (err) => {
        console.warn("RabbitMQ connection closed", err);
        this.connection = undefined;
        this.channel = undefined;
        this.consuming = false;
        if (this.lastHandler) {
          this.scheduleReconnect(this.lastHandler);
        }
      });
      this.connection.on("error", (err) => {
        console.error("RabbitMQ connection error", err);
      });
    }
    if (!this.channel) {
      this.channel = await this.connection.createChannel();
      await this.channel.prefetch(5);
      await this.channel.assertQueue(this.options.queueName ?? "kb.ingestion", { durable: true });
    }
    return this.channel;
  }

  async enqueue(task: IngestionTask): Promise<void> {
    const channel = await this.getChannel();
    channel.sendToQueue(
      this.options.queueName ?? "kb.ingestion",
      Buffer.from(JSON.stringify(task)),
      { persistent: true }
    );
  }

  async subscribe(handler: (task: IngestionTask) => Promise<void>): Promise<void> {
    if (this.consuming) return;
    this.lastHandler = handler;
    const channel = await this.getChannel();
    this.consuming = true;
    await channel.consume(
      this.options.queueName ?? "kb.ingestion",
      async (message: ConsumeMessage | null) => {
        if (!message) return;
        try {
          const payload = JSON.parse(message.content.toString()) as IngestionTask;
          await handler(payload);
          channel.ack(message);
        } catch (error) {
          console.error("Queue handler failed", error);
          const msg = (error as Error)?.message ?? "";
          const nonRetryable =
            msg.includes("no content") ||
            msg.includes("produced no content") ||
            msg.includes("not OCR-eligible");
          channel.nack(message, false, !nonRetryable);
        }
      }
    );
  }

  async close() {
    if (this.channel) {
      await this.channel.close();
      this.channel = undefined;
    }
    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
    }
    this.consuming = false;
  }

  private scheduleReconnect(handler: (task: IngestionTask) => Promise<void>) {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.subscribe(handler).catch((err) => {
        console.error("RabbitMQ reconnect failed", err);
        this.scheduleReconnect(handler);
      });
    }, 2000);
  }
}
