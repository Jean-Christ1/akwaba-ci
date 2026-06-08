import { useCallback, useEffect, useState } from "react";

/**
 * Persist the active tab in the URL (?tab=...) with localStorage fallback.
 * Also emits a lightweight tracking event so we can analyse which sections
 * are consulted the most without pulling a heavy analytics SDK.
 */
export function useTabState(storageKey: string, defaultValue: string) {
  const readInitial = (): string => {
    if (typeof window === "undefined") return defaultValue;
    const url = new URLSearchParams(window.location.search).get("tab");
    if (url) return url;
    try {
      return window.localStorage.getItem(storageKey) ?? defaultValue;
    } catch {
      return defaultValue;
    }
  };

  const [value, setValue] = useState<string>(readInitial);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, value);
    } catch {
      /* ignore quota / private mode */
    }
    const url = new URL(window.location.href);
    if (url.searchParams.get("tab") !== value) {
      url.searchParams.set("tab", value);
      window.history.replaceState({}, "", url.toString());
    }
    // Tracking hook — consumed by any analytics layer listening on window.
    window.dispatchEvent(
      new CustomEvent("akw:tab_change", { detail: { scope: storageKey, tab: value } }),
    );
  }, [storageKey, value]);

  const onChange = useCallback((next: string) => setValue(next), []);

  return [value, onChange] as const;
}
