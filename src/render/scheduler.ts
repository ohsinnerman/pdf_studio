/**
 * Render scheduler (docs/ARCHITECTURE.md §5 and §7).
 *
 * - One render in flight at a time: the engine worker is single-threaded anyway,
 *   and keeping the queue on our side is what makes cancellation possible.
 * - Priority queue: visible pages first (lower number = sooner), thumbnails later.
 * - Cancellation: when a page scrolls out of view its request is dropped before it starts.
 * - De-duplication: two requests for the same bitmap share one render.
 * - Generations: a structural change (delete, reorder…) moves page indices, so
 *   results of requests made before it are discarded rather than cached under
 *   the wrong page.
 */
import { roundScale, type Bitmap, type BitmapCache, type BitmapKey } from './cache.ts';

export interface RenderRequest extends BitmapKey {
  readonly pageIndex: number;
  readonly priority: number;
}

export type RenderFn<B> = (docId: string, pageIndex: number, scale: number) => Promise<B>;

interface Job<B> {
  readonly id: string;
  readonly request: RenderRequest;
  readonly generation: number;
  readonly order: number;
  priority: number;
  readonly waiters: Set<Waiter<B>>;
}

interface Waiter<B> {
  resolve(bitmap: B): void;
  reject(err: unknown): void;
}

export class CancelledError extends Error {
  constructor() {
    super('Render cancelled');
    this.name = 'CancelledError';
  }
}

const jobId = (r: BitmapKey & { pageIndex: number }) =>
  `${r.docId}|${r.pageKey}|${r.revision}|${r.scale}|${r.pageIndex}`;

export class RenderScheduler<B extends Bitmap> {
  private readonly queue = new Map<string, Job<B>>();
  /** The job currently being rendered; identical requests join it. */
  private inflight: Job<B> | null = null;
  private running = false;
  private generation = 0;
  private counter = 0;

  constructor(
    private readonly render: RenderFn<B>,
    readonly cache: BitmapCache<B>,
  ) {}

  /**
   * Resolves with the bitmap, from cache if possible. Rejects with CancelledError
   * if `signal` aborts first or the document's structure changes.
   */
  request(input: RenderRequest, signal?: AbortSignal): Promise<B> {
    const request = { ...input, scale: roundScale(input.scale) };
    const cached = this.cache.get(request);
    if (cached) return Promise.resolve(cached);
    if (signal?.aborted) return Promise.reject(new CancelledError());

    return new Promise<B>((resolve, reject) => {
      const id = jobId(request);
      const running = this.inflight?.id === id && this.inflight.generation === this.generation;
      let job = running ? this.inflight! : this.queue.get(id);
      if (!job) {
        job = {
          id,
          request,
          generation: this.generation,
          order: this.counter++,
          priority: request.priority,
          waiters: new Set(),
        };
        this.queue.set(id, job);
      }
      job.priority = Math.min(job.priority, request.priority);
      const waiter: Waiter<B> = { resolve, reject };
      job.waiters.add(waiter);

      signal?.addEventListener(
        'abort',
        () => {
          if (!job.waiters.delete(waiter)) return;
          reject(new CancelledError());
          // Nobody wants it any more and it hasn't started: drop it.
          if (job.waiters.size === 0 && this.queue.get(id) === job) this.queue.delete(id);
        },
        { once: true },
      );

      void this.pump();
    });
  }

  /** Call after any command that can move pages. Pending work is cancelled. */
  invalidateStructure(): void {
    this.generation++;
    for (const job of this.queue.values()) {
      for (const w of job.waiters) w.reject(new CancelledError());
    }
    this.queue.clear();
  }

  /** Number of queued (not yet started) renders. For tests and diagnostics. */
  get pending(): number {
    return this.queue.size;
  }

  private next(): Job<B> | undefined {
    let best: Job<B> | undefined;
    for (const job of this.queue.values()) {
      if (
        !best ||
        job.priority < best.priority ||
        (job.priority === best.priority && job.order < best.order)
      ) {
        best = job;
      }
    }
    return best;
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let job = this.next(); job; job = this.next()) {
        this.queue.delete(job.id);
        this.inflight = job;
        const { docId, pageIndex, scale } = job.request;
        try {
          const bitmap = await this.render(docId, pageIndex, scale);
          if (job.generation !== this.generation) {
            bitmap.close();
            for (const w of job.waiters) w.reject(new CancelledError());
            continue;
          }
          this.cache.set(job.request, bitmap);
          for (const w of job.waiters) w.resolve(bitmap);
        } catch (err) {
          for (const w of job.waiters) w.reject(err);
        } finally {
          this.inflight = null;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
