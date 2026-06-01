// Pure helpers for the moderation queue: filter/sort/paginate + CSV export.
// Extracted so they can be unit-tested without rendering AdminPage.

export type PlaceRow = {
  id: string;
  name: string;
  city: string;
  type: string;
  status: string;
  address?: string | null;
  zone?: string | null;
  created_at: string;
  updated_at?: string | null;
  owner_id?: string | null;
  email?: string | null;
};

export type ModerationEvent = {
  id: string;
  place_id: string;
  action: "approved" | "rejected" | "note" | string;
  note: string | null;
  created_at: string;
  email_status?: string | null; // optional, surfaced from edge function logs
};

export type Filters = {
  search: string;
  city: string; // "all" or specific
  type: string; // "all" or specific
  status: "pending" | "rejected" | "all";
  since: string; // YYYY-MM-DD or empty
};

export type Sort = "date_desc" | "date_asc" | "status" | "city";

export function filterPlaces(rows: PlaceRow[], f: Filters): PlaceRow[] {
  const q = f.search.trim().toLowerCase();
  const sinceTs = f.since ? new Date(f.since).getTime() : 0;
  return rows.filter((p) =>
    (f.status === "all" || p.status === f.status) &&
    (f.city === "all" || p.city === f.city) &&
    (f.type === "all" || p.type === f.type) &&
    (!sinceTs || new Date(p.created_at).getTime() >= sinceTs) &&
    (!q || `${p.name} ${p.city} ${p.address ?? ""} ${p.zone ?? ""}`.toLowerCase().includes(q))
  );
}

export function sortPlaces(rows: PlaceRow[], sort: Sort): PlaceRow[] {
  const out = [...rows];
  out.sort((a, b) => {
    if (sort === "date_asc") return +new Date(a.created_at) - +new Date(b.created_at);
    if (sort === "status") return String(a.status).localeCompare(String(b.status));
    if (sort === "city") return String(a.city).localeCompare(String(b.city));
    return +new Date(b.created_at) - +new Date(a.created_at);
  });
  return out;
}

export function paginate<T>(rows: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  const p = Math.min(Math.max(1, page), totalPages);
  return { page: p, totalPages, items: rows.slice((p - 1) * size, p * size) };
}

// ── CSV ─────────────────────────────────────────────────────────────────────
const CSV_HEADERS = [
  "place_id", "name", "city", "type", "status", "address",
  "created_at", "updated_at", "action", "note", "event_date", "email_status",
] as const;

const esc = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n;\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// ISO date string with seconds in UTC, e.g. 2026-06-01T18:05:16Z
export const toIsoDate = (v: string | null | undefined) => {
  if (!v) return "";
  const d = new Date(v);
  return isNaN(+d) ? "" : d.toISOString().replace(/\.\d{3}Z$/, "Z");
};

export function buildModerationCsv(
  places: PlaceRow[],
  eventsByPlace: Record<string, ModerationEvent | undefined>,
): string {
  const lines = [CSV_HEADERS.join(",")];
  for (const p of places) {
    const ev = eventsByPlace[p.id];
    lines.push([
      esc(p.id), esc(p.name), esc(p.city), esc(p.type), esc(p.status),
      esc(p.address ?? ""), esc(toIsoDate(p.created_at)), esc(toIsoDate(p.updated_at)),
      esc(ev?.action ?? ""), esc(ev?.note ?? ""),
      esc(toIsoDate(ev?.created_at)), esc(ev?.email_status ?? ""),
    ].join(","));
  }
  return "\uFEFF" + lines.join("\n");
}

export { CSV_HEADERS };
