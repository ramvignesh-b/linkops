/**
 * A fixed-capacity FIFO. Pushing past capacity evicts the oldest entry
 * rather than growing — the memory bound the Simulator's per-Link Sample
 * history needs, generic over what it holds.
 */
export class RingBuffer<T> {
  private readonly items: T[] = [];

  constructor(private readonly capacity: number) {}

  push(item: T): void {
    this.items.push(item);

    if (this.items.length > this.capacity) {
      this.items.shift();
    }
  }

  toArray(): readonly T[] {
    return [...this.items];
  }

  /** O(1) — reads the newest item without copying the buffer. */
  peekLast(): T | undefined {
    return this.items[this.items.length - 1];
  }
}
