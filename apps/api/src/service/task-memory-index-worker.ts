import type { TaskMemorySearchService } from "./task-memory-search.js";

const INDEXER_IDLE_DELAY_MS = 2_000;
const INDEXER_BUSY_DELAY_MS = 20;

export class TaskMemoryIndexWorker {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<void> | null = null;
  private closed = false;

  public constructor(private readonly search: TaskMemorySearchService) {}

  public start(): void {
    if (this.timer != null || this.running != null || this.closed) {
      return;
    }
    this.schedule(250);
  }

  public async close(): Promise<void> {
    this.closed = true;
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.running;
  }

  private schedule(delay: number): void {
    if (this.closed) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.running = this.runOnce();
    }, delay);
    this.timer.unref();
  }

  private async runOnce(): Promise<void> {
    let processed = 0;
    try {
      processed = await this.search.processPendingJobs();
    } catch {
      processed = 0;
    } finally {
      this.running = null;
      this.schedule(processed > 0 ? INDEXER_BUSY_DELAY_MS : INDEXER_IDLE_DELAY_MS);
    }
  }
}
