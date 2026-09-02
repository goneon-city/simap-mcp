/**
 * Sliding-window rate limiter with FIFO queue.
 *
 * Replaces the previous busy-wait loop which, under concurrent calls,
 * could pile up setTimeout handles and serve callers out of order.
 *
 * Guarantees:
 *   - At most `maxRequests` acquires resolve within any `windowMs` period.
 *   - Callers are served strictly in FIFO order.
 *   - At most one scheduled timer is outstanding at any time.
 */

export interface RateLimiterOptions {
  /** Max number of acquires per sliding window. */
  maxRequests: number;
  /** Window size in ms. */
  windowMs: number;
  /**
   * Injectable clock for tests. Only affects internal time calculations in
   * `acquire()`; real `setTimeout` calls used by `scheduleDrain()` are not
   * steered by this. When testing queued `acquire()` behavior, pair a fake
   * `now` with fake timers (e.g. `vi.useFakeTimers()` + `advanceTimersByTime`).
   */
  now?: () => number;
}

const DEFAULT_OPTIONS: Required<Pick<RateLimiterOptions, "maxRequests" | "windowMs">> = {
  maxRequests: 60,
  windowMs: 60_000,
};

interface QueueEntry {
  resolve: () => void;
  reject: (error: Error) => void;
  cleanup?: () => void;
}

/**
 * Named "TimeoutError" (matching the DOM/fetch convention) so callers'
 * generic network/timeout error handling picks it up without special-casing
 * the rate limiter.
 */
function rateLimiterTimeoutError(): Error {
  const error = new Error("Timed out waiting for a rate limiter slot");
  error.name = "TimeoutError";
  return error;
}

export class SlidingWindowRateLimiter {
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly now: () => number;
  private timestamps: number[] = [];
  private queue: QueueEntry[] = [];
  private scheduled = false;

  constructor(opts: Partial<RateLimiterOptions> = {}) {
    this.maxRequests = opts.maxRequests ?? DEFAULT_OPTIONS.maxRequests;
    this.windowMs = opts.windowMs ?? DEFAULT_OPTIONS.windowMs;
    this.now = opts.now ?? (() => Date.now());

    if (!Number.isFinite(this.maxRequests) || this.maxRequests <= 0) {
      throw new Error(
        `SlidingWindowRateLimiter: maxRequests must be a positive finite number (got ${this.maxRequests})`
      );
    }
    if (!Number.isFinite(this.windowMs) || this.windowMs <= 0) {
      throw new Error(
        `SlidingWindowRateLimiter: windowMs must be a positive finite number (got ${this.windowMs})`
      );
    }
  }

  /**
   * Waits until a slot is available, then records it and resolves.
   * Concurrent callers are served FIFO.
   *
   * If `signal` is provided and fires while the caller is still queued, the
   * caller is dequeued and the promise rejects — this bounds how long a
   * request can wait behind others (e.g. by tying it to the caller's own
   * request timeout) instead of queuing indefinitely.
   */
  acquire(signal?: AbortSignal): Promise<void> {
    this.prune();
    if (this.queue.length === 0 && this.timestamps.length < this.maxRequests) {
      this.timestamps.push(this.now());
      return Promise.resolve();
    }

    if (signal?.aborted) {
      return Promise.reject(rateLimiterTimeoutError());
    }

    return new Promise<void>((resolve, reject) => {
      const entry: QueueEntry = { resolve, reject };
      if (signal) {
        const onAbort = (): void => {
          const index = this.queue.indexOf(entry);
          if (index !== -1) {
            this.queue.splice(index, 1);
            reject(rateLimiterTimeoutError());
          }
        };
        signal.addEventListener("abort", onAbort, { once: true });
        entry.cleanup = () => signal.removeEventListener("abort", onAbort);
      }
      this.queue.push(entry);
      this.scheduleDrain();
    });
  }

  /** Drops timestamps older than the window. */
  private prune(): void {
    const cutoff = this.now() - this.windowMs;
    // Timestamps are pushed in chronological order, so shift from the front.
    while (this.timestamps.length > 0 && this.timestamps[0] <= cutoff) {
      this.timestamps.shift();
    }
  }

  /**
   * Ensures exactly one timer is outstanding. On fire, drains as many
   * queued callers as free slots allow, then reschedules if needed.
   */
  private scheduleDrain(): void {
    if (this.scheduled || this.queue.length === 0) return;

    this.prune();
    const delay =
      this.timestamps.length < this.maxRequests
        ? 0
        : Math.max(0, this.timestamps[0] + this.windowMs - this.now());

    this.scheduled = true;
    const timer = setTimeout(() => {
      this.scheduled = false;
      this.drain();
    }, delay);
    // Don't keep the Node event loop alive just for a pending rate-limit timer.
    timer.unref?.();
  }

  private drain(): void {
    this.prune();
    while (this.timestamps.length < this.maxRequests && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      entry.cleanup?.();
      this.timestamps.push(this.now());
      entry.resolve();
    }
    if (this.queue.length > 0) {
      this.scheduleDrain();
    }
  }
}
