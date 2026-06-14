export class AsyncQueue<T> implements AsyncIterable<T> {
  private closed = false;
  private readonly items: T[] = [];
  private readonly waiting: Array<(result: IteratorResult<T>) => void> = [];

  public close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    for (const resolve of this.waiting.splice(0)) {
      resolve({ done: true, value: undefined });
    }
  }

  public push(item: T): void {
    if (this.closed) {
      return;
    }

    const resolve = this.waiting.shift();
    if (resolve != null) {
      resolve({ done: false, value: item });
      return;
    }

    this.items.push(item);
  }

  public [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        const item = this.items.shift();
        if (item !== undefined) {
          return Promise.resolve({ done: false, value: item });
        }

        if (this.closed) {
          return Promise.resolve({ done: true, value: undefined });
        }

        return new Promise<IteratorResult<T>>((resolve) => {
          this.waiting.push(resolve);
        });
      }
    };
  }
}
