import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { PLACES, CITIES } from "@/modules/places/infrastructure/data";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { cn } from "@/lib/utils";
import type { PlaceType } from "@/modules/places/domain/types";

const TYPES: { value: PlaceType | "all"; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "lodging", label: "Hébergements" },
  { value: "restaurant", label: "Restaurants" },
  { value: "maquis", label: "Maquis" },
  { value: "culture", label: "Culture" },
  { value: "attraction", label: "Lieux" },
  { value: "beach", label: "Plages" },
];

export default function ExplorerPage() {
  const [params, setParams] = useSearchParams();
  const initialType = (params.get("type") as PlaceType) ?? "all";
  const initialCity = params.get("city") ?? "all";

  const [type, setType] = useState<PlaceType | "all">(initialType);
  const [city, setCity] = useState<string>(initialCity);
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    return PLACES.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (city !== "all" && p.city !== city) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${p.name} ${p.tagline} ${p.zone ?? ""} ${p.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [type, city, q]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all" || !value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <div className="bg-background">
      {/* En-tête recherche — compact, dense */}
      <section className="sticky top-0 z-20 border-b border-border/60 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="akw-container py-3 sm:py-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <h1 className="sr-only">Explorer les lieux</h1>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Hôtel, restaurant, quartier, ambiance…"
                className="h-10 w-full rounded-full border border-border bg-background pl-10 pr-9 text-sm outline-none transition-colors placeholder:text-muted-foreground/70 focus:border-primary"
              />
              {q && (
                <button
                  onClick={() => setQ("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 hover:bg-muted"
                  aria-label="Effacer"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                updateParam("city", e.target.value);
              }}
              className="h-10 rounded-full border border-border bg-background px-4 text-sm font-medium outline-none focus:border-primary"
            >
              <option value="all">Toutes les villes</option>
              {CITIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="scrollbar-none flex gap-2 overflow-x-auto">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setType(t.value);
                  updateParam("type", t.value);
                }}
                className={cn(
                  "akw-chip flex-shrink-0 !py-1 !px-3 !text-xs",
                  type === t.value && "akw-chip-active"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* RÉSULTATS */}
      <section className="py-5 sm:py-6">
        <div className="akw-container">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{results.length}</span>{" "}
              {results.length > 1 ? "lieux trouvés" : "lieu trouvé"}
            </p>
            <button className="flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium hover:border-primary/40">
              <SlidersHorizontal className="h-4 w-4" />
              Trier
            </button>
          </div>

          {results.length === 0 ? (
            <div className="akw-card flex flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Search className="h-5 w-5 text-muted-foreground" />
              </div>
              <h3 className="font-display text-xl font-semibold">Aucun lieu ne correspond</h3>
              <p className="max-w-md text-sm text-muted-foreground">
                Essayez d'élargir vos filtres, ou modifiez votre recherche. Si une adresse vous
                semble manquante, signalez-la nous depuis votre profil.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {results.map((p) => (
                <PlaceCard key={p.id} place={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
