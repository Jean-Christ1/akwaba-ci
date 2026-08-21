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

// Génériques sur la ligne : l'écran travaille sur la ligne complète de la base
// et a besoin de récupérer, après filtrage, les colonnes que ce module ignore
// (image, description). Un retour figé sur PlaceRow les effacerait.
export function filterPlaces<T extends PlaceRow>(rows: T[], f: Filters): T[] {
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

export function sortPlaces<T extends PlaceRow>(rows: T[], sort: Sort): T[] {
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

// Build a descriptive CSV filename including date + active filters.
// Example: moderation_2026-06-02_city-Abidjan_status-pending_since-2026-05-01.csv
export function buildCsvFilename(f: Partial<Filters> = {}, now: Date = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  const parts = [`moderation_${date}`];
  if (f.city && f.city !== "all") parts.push(`city-${slug(f.city)}`);
  if (f.status && f.status !== "all") parts.push(`status-${slug(f.status)}`);
  if (f.type && f.type !== "all") parts.push(`type-${slug(f.type)}`);
  if (f.since) parts.push(`since-${slug(f.since)}`);
  return `${parts.join("_")}.csv`;
}
const slug = (s: string) => String(s).trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");

