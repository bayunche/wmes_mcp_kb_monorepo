import { IngestionTask } from "@kb/shared-schemas";
import { QueueClient } from "../types";

type Handler = (task: IngestionTask) => Promise<void>;

export class InMemoryQueue implements QueueClient {
  private tasks: IngestionTask[] = [];
  private handler?: Handler;
  private processing = false;

  async enqueue(task: IngestionTask): Promise<void> {
    this.tasks.push(task);
    await this.flush();
  }

  async subscribe(handler: Handler): Promise<void> {
    this.handler = handler;
    await this.flush();
  }

  private async flush() {
    if (this.processing || !this.handler) {
      return;
    }
    this.processing = true;
    while (this.tasks.length && this.handler) {
      const next = this.tasks.shift()!;
      try {
        await this.handler(next);
      } catch (error) {
        console.error("In-memory queue handler failed", error);
      }
    }
    this.processing = false;
  }
}
