import { logger } from "@/lib/logger";
/**
 * Lightweight sink for the `akw:tab_change` CustomEvent emitted by useTabState.
 * - Dedupes consecutive events on the same (scope, tab).
 * - Batches in-memory; flushes on visibilitychange/pagehide.
 * - Exposes a getter for tests / dev panels.
 * Heavy SDKs (PostHog, Segment) can plug in later via `setSink`.
 */
type TabEvent = { scope: string; tab: string; at: number };

let buffer: TabEvent[] = [];
let last: { scope: string; tab: string } | null = null;
let sink: (events: TabEvent[]) => void = (events) => {
  // Default sink: structured console (visible in dev, harmless in prod).
  if (events.length) logger.debug("[akw:tabs]", events);
};

export function setTabAnalyticsSink(fn: (events: TabEvent[]) => void) {
  sink = fn;
}

export function getBufferedTabEvents(): TabEvent[] {
  return [...buffer];
}

function flush() {
  if (!buffer.length) return;
  const out = buffer;
  buffer = [];
  try {
    sink(out);
  } catch (e) {
    console.warn("[akw:tabs] sink failed", e);
  }
}

let initialised = false;
export function initTabAnalytics() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;

  window.addEventListener("akw:tab_change", (e: Event) => {
    const detail = (e as CustomEvent<{ scope: string; tab: string }>).detail;
    if (!detail) return;
    if (last && last.scope === detail.scope && last.tab === detail.tab) return;
    last = { scope: detail.scope, tab: detail.tab };
    buffer.push({ ...detail, at: Date.now() });
    if (buffer.length >= 10) flush();
  });

  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
