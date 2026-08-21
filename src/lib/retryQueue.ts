import { useSyncExternalStore } from 'react';

// A brief-network-drop-resilient write queue — NOT an offline cache. Actions are held in memory
// only (module scope, not persisted), so they survive a few seconds of bad signal and SPA
// navigation within the same page load, but not a hard refresh or closed tab. That's an
// intentional scope boundary: loading the board still requires a live connection.

const BACKOFF_MS = [2000, 5000, 15000];
const STEADY_RETRY_MS = 30000;
const STUCK_AFTER_MS = 3 * 60 * 1000;

export interface QueueItem {
  id: string;
  /** Groups actions that must apply in order — e.g. every action for one booking_ref. Actions
      under different keys never wait on each other. */
  key: string;
  label: string;
  attempts: number;
  createdAt: number;
  stuck: boolean;
}

interface InternalItem extends QueueItem {
  run: () => Promise<void>;
  timer: ReturnType<typeof setTimeout> | null;
  retryNow: (() => void) | null;
}

const items = new Map<string, InternalItem>();
const chains = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

let snapshot: QueueItem[] = [];

function recomputeSnapshot() {
  snapshot = Array.from(items.values()).map(({ id, key, label, attempts, createdAt, stuck }) => (
    { id, key, label, attempts, createdAt, stuck }
  ));
}

function notify() {
  recomputeSnapshot();
  listeners.forEach((l) => l());
}

function runUntilSuccess(item: InternalItem): Promise<void> {
  return new Promise<void>((resolve) => {
    const attempt = () => {
      item.timer = null;
      item.run()
        .then(() => {
          items.delete(item.id);
          notify();
          resolve();
        })
        .catch((err) => {
          if (!items.has(item.id)) { resolve(); return; }
          item.attempts += 1;
          if (Date.now() - item.createdAt >= STUCK_AFTER_MS) item.stuck = true;
          const delay = BACKOFF_MS[item.attempts - 1] ?? STEADY_RETRY_MS;
          item.timer = setTimeout(attempt, delay);
          notify();
          if (import.meta.env?.DEV) {
            console.warn(`[retryQueue] "${item.label}" failed (attempt ${item.attempts}), retrying in ${delay}ms`, err);
          }
        });
    };
    item.retryNow = attempt;
    attempt();
  });
}

/**
 * Queues a write for background retry with backoff. Returns immediately — the caller is
 * expected to have already applied the optimistic UI update before calling this. `run` must be
 * safe to call more than once for the same logical action (see each call site for how idempotency
 * is achieved without a DB constraint change).
 */
export function enqueueRetry(key: string, label: string, run: () => Promise<void>): void {
  const id = `${key}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const item: InternalItem = { id, key, label, attempts: 0, createdAt: Date.now(), stuck: false, run, timer: null, retryNow: null };
  items.set(id, item);
  notify();

  // Serialize actions sharing a key (e.g. check-in then reset on the same guest) so they can
  // never apply out of order — a later action only starts once the earlier one for the SAME key
  // has actually succeeded. Different keys are fully independent and never block each other.
  const prevChain = chains.get(key) || Promise.resolve();
  const thisChain = prevChain.then(() => runUntilSuccess(item));
  chains.set(key, thisChain);
}

/** Skips every pending item straight to a retry attempt now, instead of waiting for its backoff
    timer. Called on the browser's `online` event so reconnecting flushes instantly. */
export function flushRetryQueueNow(): void {
  items.forEach((item) => {
    if (item.timer !== null) {
      clearTimeout(item.timer);
      item.timer = null;
      item.retryNow?.();
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', flushRetryQueueNow);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): QueueItem[] {
  return snapshot;
}

/** Live list of everything currently queued/retrying, across the whole app. */
export function useRetryQueueItems(): QueueItem[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
