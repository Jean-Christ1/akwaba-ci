import { describe, it, expect } from "vitest";
import {
  buildModerationCsv, buildCsvFilename, CSV_HEADERS, filterPlaces, paginate, sortPlaces, toIsoDate,
  type ModerationEvent, type PlaceRow,
} from "@/pages/admin/moderation-utils";


const mkPlace = (over: Partial<PlaceRow> = {}): PlaceRow => ({
  id: over.id ?? crypto.randomUUID(),
  name: over.name ?? "Resto",
  city: over.city ?? "Abidjan",
  type: over.type ?? "restaurant",
  status: over.status ?? "pending",
  address: over.address ?? "rue 1",
  created_at: over.created_at ?? "2026-05-01T10:00:00.000Z",
  updated_at: over.updated_at ?? "2026-05-02T10:00:00.000Z",
  owner_id: over.owner_id ?? "owner-1",
  email: over.email ?? "x@y.z",
  zone: over.zone ?? null,
});

const baseFilters = {
  search: "", city: "all", type: "all", status: "pending" as const, since: "",
};

describe("filterPlaces", () => {
  const rows = [
    mkPlace({ id: "1", city: "Abidjan", status: "pending", created_at: "2026-05-01T00:00:00Z" }),
    mkPlace({ id: "2", city: "Yamoussoukro", status: "rejected", created_at: "2026-05-10T00:00:00Z" }),
    mkPlace({ id: "3", city: "Abidjan", status: "pending", name: "Maquis Soleil", created_at: "2026-05-20T00:00:00Z" }),
  ];

  it("filters by status by default (pending)", () => {
    expect(filterPlaces(rows, baseFilters).map((r) => r.id).sort()).toEqual(["1", "3"]);
  });
  it("filters by city", () => {
    expect(filterPlaces(rows, { ...baseFilters, status: "all", city: "Yamoussoukro" }).map((r) => r.id)).toEqual(["2"]);
  });
  it("filters by date (since)", () => {
    expect(filterPlaces(rows, { ...baseFilters, status: "all", since: "2026-05-15" }).map((r) => r.id)).toEqual(["3"]);
  });
  it("filters by full-text search across name/address/zone", () => {
    expect(filterPlaces(rows, { ...baseFilters, status: "all", search: "soleil" }).map((r) => r.id)).toEqual(["3"]);
  });
});

describe("sortPlaces + paginate", () => {
  const rows = [
    mkPlace({ id: "a", city: "Bouaké", created_at: "2026-01-01T00:00:00Z", status: "pending" }),
    mkPlace({ id: "b", city: "Abidjan", created_at: "2026-03-01T00:00:00Z", status: "rejected" }),
    mkPlace({ id: "c", city: "Korhogo", created_at: "2026-02-01T00:00:00Z", status: "pending" }),
  ];
  it("sorts by date desc by default", () => {
    expect(sortPlaces(rows, "date_desc").map((r) => r.id)).toEqual(["b", "c", "a"]);
  });
  it("sorts by city", () => {
    expect(sortPlaces(rows, "city").map((r) => r.id)).toEqual(["b", "a", "c"]);
  });
  it("paginates and clamps page", () => {
    const r = paginate(rows, 99, 2);
    expect(r.page).toBe(2); expect(r.totalPages).toBe(2); expect(r.items.length).toBe(1);
  });
});

describe("toIsoDate", () => {
  it("returns UTC ISO with seconds, no milliseconds", () => {
    expect(toIsoDate("2026-05-01T10:00:00.123Z")).toBe("2026-05-01T10:00:00Z");
  });
  it("handles empty / invalid gracefully", () => {
    expect(toIsoDate(null)).toBe("");
    expect(toIsoDate("nope")).toBe("");
  });
});

describe("buildModerationCsv", () => {
  const places: PlaceRow[] = [
    mkPlace({ id: "p1", name: "Chez, Akwaba", city: "Abidjan", status: "rejected", created_at: "2026-05-01T10:00:00.000Z" }),
    mkPlace({ id: "p2", name: 'Le "Bon" Spot', city: "Abidjan", status: "pending", created_at: "2026-05-02T10:00:00.000Z" }),
  ];
  const events: Record<string, ModerationEvent | undefined> = {
    p1: { id: "e1", place_id: "p1", action: "rejected", note: "manque photos merci", created_at: "2026-05-03T12:30:45.000Z", email_status: "sent" },
    // p2 has no event
  };
  // Use the raw CSV string for newline-aware assertions, lines[] for column-positional ones.
  const csvWithNewlineNote = buildModerationCsv(
    [mkPlace({ id: "x", name: "X" })],
    { x: { id: "e", place_id: "x", action: "rejected", note: "ligne1\nligne2", created_at: "2026-05-03T12:30:45Z" } },
  );
  const csv = buildModerationCsv(places, events);
  const lines = csv.replace(/^\uFEFF/, "").split("\n");

  it("starts with UTF-8 BOM", () => {
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });
  it("includes required moderation columns in header", () => {
    expect(lines[0]).toBe(CSV_HEADERS.join(","));
    for (const col of ["action", "note", "event_date", "email_status", "status", "city"]) {
      expect(lines[0].split(",")).toContain(col);
    }
  });
  it("renders one row per place and quotes commas/quotes/newlines", () => {
    expect(lines.length).toBe(3);
    expect(lines[1]).toContain('"Chez, Akwaba"');
    expect(lines[2]).toContain('"Le ""Bon"" Spot"');
    expect(csvWithNewlineNote).toContain('"ligne1\nligne2"');
  });
  it("formats event_date as ISO UTC without milliseconds", () => {
    expect(lines[1]).toContain("2026-05-03T12:30:45Z");
  });
  it("surfaces email_status when known", () => {
    expect(lines[1].endsWith(",sent")).toBe(true);
  });
  it("leaves event columns empty when no event for the place (RLS-hidden case)", () => {
    // p2 row has no event — last 4 columns must be empty (trailing commas)
    expect(lines[2].endsWith(",,,,")).toBe(true);
  });
});

describe("RLS partner export shape", () => {
  // Simulates the data a partner would receive: they only see their own places,
  // and events for other partners' places are filtered out by RLS.
  it("produces a CSV with only the partner's rows and no foreign events", () => {
    const partnerPlaces: PlaceRow[] = [mkPlace({ id: "own", owner_id: "me" })];
    const eventsForeignFiltered: Record<string, ModerationEvent | undefined> = {
      own: { id: "e", place_id: "own", action: "approved", note: "ok", created_at: "2026-05-04T00:00:00Z" },
      // foreign place "stranger" intentionally absent — RLS hides it server-side
    };
    const csv = buildModerationCsv(partnerPlaces, eventsForeignFiltered);
    expect(csv).toContain("own");
    expect(csv).not.toContain("stranger");
  });
});

describe("buildCsvFilename", () => {
  const now = new Date("2026-06-02T10:00:00Z");
  it("uses date prefix and .csv extension", () => {
    expect(buildCsvFilename({}, now)).toBe("moderation_2026-06-02.csv");
  });
  it("includes active filters and slugifies values", () => {
    const name = buildCsvFilename(
      { city: "Abidjan", status: "pending", type: "all", since: "2026-05-01" },
      now,
    );
    expect(name).toBe("moderation_2026-06-02_city-abidjan_status-pending_since-2026-05-01.csv");
  });
  it("omits filters set to 'all' or empty", () => {
    const name = buildCsvFilename({ city: "all", status: "all", type: "all", since: "" }, now);
    expect(name).toBe("moderation_2026-06-02.csv");
  });
});

describe("CSV date format guarantees", () => {
  it("every event_date cell is ISO UTC without milliseconds", () => {
    const places: PlaceRow[] = Array.from({ length: 5 }).map((_, i) => ({
      id: `p${i}`, name: `N${i}`, city: "Abidjan", type: "restaurant",
      status: "pending", created_at: `2026-05-0${i + 1}T10:00:00.${i}23Z`,
    } as PlaceRow));
    const events: Record<string, ModerationEvent> = Object.fromEntries(
      places.map((p, i) => [p.id, {
        id: `e${i}`, place_id: p.id, action: "approved",
        note: null, created_at: `2026-05-0${i + 1}T12:34:56.789Z`,
      }]),
    );
    const csv = buildModerationCsv(places, events);
    const eventDates = csv.replace(/^\uFEFF/, "").split("\n").slice(1)
      .map((line) => line.split(",")[10]); // event_date column
    for (const d of eventDates) {
      expect(d).toMatch(/^2026-05-0\dT12:34:56Z$/);
      expect(d).not.toMatch(/\.\d{3}Z$/);
    }
  });
});
