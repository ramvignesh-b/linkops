/**
 * A test-only SSE Client: it holds a real connection open, parses frames off
 * the wire as they arrive, and disconnects by aborting the request — a real
 * client disconnect, which is the only kind that proves the server released
 * the subscription.
 *
 * Supertest is the right tool everywhere else in this repository and the
 * wrong one here: it buffers a response until it ends, and an SSE response
 * never ends.
 *
 * A duplicate of `server/stream-api`'s own fixture of the same name, kept
 * local rather than imported: `server/stream-api`'s public API is its
 * module and its subscriber counter, not its test doubles, and every other
 * library in this repo keeps its fixtures un-exported for the same reason —
 * see `server/telemetry`'s `link-record.fixture.ts`.
 */

/** One SSE frame as a Client sees it — a comment frame carries only `comment`. */
export interface StreamFrame {
  event?: string;
  id?: string;
  retry?: number;
  comment?: string;
  data?: unknown;
}

/**
 * Yields to the event loop until `predicate` holds. Not a sleep: it advances
 * no clock and waits no interval, it only lets pending socket I/O run —
 * the one thing a fake clock cannot drive. It gives up rather than hanging,
 * so a broken expectation fails the test instead of timing the suite out.
 */
export async function until(
  predicate: () => boolean,
  what: string,
): Promise<void> {
  for (let turn = 0; turn < 2_000; turn++) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }

  throw new Error(`gave up waiting for ${what}`);
}

/** `field: value`, with the one optional space after the colon stripped. */
function splitField(line: string): [string, string] {
  const separator = line.indexOf(':');

  return separator === -1
    ? [line, '']
    : [line.slice(0, separator), line.slice(separator + 1).trimStart()];
}

function applyField(frame: StreamFrame, field: string, value: string): void {
  if (field === 'event') frame.event = value;
  if (field === 'id') frame.id = value;
  if (field === 'retry') frame.retry = Number(value);
}

function parseFrame(block: string): StreamFrame {
  const frame: StreamFrame = {};
  const data: string[] = [];

  for (const line of block.split('\n')) {
    if (line === '') continue;

    if (line.startsWith(':')) {
      frame.comment = line.slice(1).trimStart();
      continue;
    }

    const [field, value] = splitField(line);

    if (field === 'data') data.push(value);
    else applyField(frame, field, value);
  }

  if (data.length > 0) frame.data = JSON.parse(data.join('\n'));

  return frame;
}

export class SseTestClient {
  readonly frames: StreamFrame[] = [];

  private buffer = '';
  private endedCleanly = false;

  private constructor(
    readonly response: Response,
    private readonly controller: AbortController,
  ) {}

  static async connect(url: string): Promise<SseTestClient> {
    const controller = new AbortController();
    const response = await fetch(url, { signal: controller.signal });
    const client = new SseTestClient(response, controller);

    void client.read();

    return client;
  }

  /** True once the server ended the response — end of stream, not an error. */
  get ended(): boolean {
    return this.endedCleanly;
  }

  /** The frames received so far, once at least `count` have arrived. */
  async take(count: number): Promise<StreamFrame[]> {
    await until(
      () => this.frames.length >= count,
      `${count} frames (received ${this.frames.length})`,
    );

    return this.frames;
  }

  /** Frames carrying this event name, once at least `count` have arrived. */
  async takeOfType(event: string, count: number): Promise<StreamFrame[]> {
    await until(
      () => this.of(event).length >= count,
      `${count} ${event} frames (received ${this.of(event).length})`,
    );

    return this.of(event);
  }

  of(event: string): StreamFrame[] {
    return this.frames.filter((frame) => frame.event === event);
  }

  /** A real disconnect: the request is aborted, exactly as a killed Client would. */
  disconnect(): void {
    this.controller.abort();
  }

  private async read(): Promise<void> {
    const body = this.response.body;
    if (body === null) return;

    const decoder = new TextDecoder();
    const reader = body.getReader();

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        this.consume(decoder.decode(value, { stream: true }));
      }
      this.endedCleanly = true;
    } catch {
      // An aborted request rejects here; that is this Client's own doing and
      // is never an end of stream.
    }
  }

  private consume(text: string): void {
    this.buffer += text;
    const blocks = this.buffer.split('\n\n');
    this.buffer = blocks.pop() ?? '';

    for (const block of blocks) {
      if (block.trim() === '') continue;
      this.frames.push(parseFrame(block));
    }
  }
}
