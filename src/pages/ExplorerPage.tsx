import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { useCatalogCities } from "@/modules/places/application/useCatalogCities";
import { usePlaces } from "@/modules/places/application/usePlaces";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PlaceType } from "@/modules/places/domain/types";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

const TYPES: { value: PlaceType | "all"; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "lodging", label: "Hébergements" },
  { value: "restaurant", label: "Restaurants" },
  { value: "maquis", label: "Maquis" },
  { value: "culture", label: "Culture" },
  { value: "attraction", label: "Lieux" },
  { value: "beach", label: "Plages" },
];

type Sort = "relevance" | "name_asc" | "standing_desc";

export default function ExplorerPage() {
  const { cities: CITIES } = useCatalogCities();
  usePageTitle("Explorer les adresses", "Hôtels, restaurants, maquis et lieux à découvrir en Côte d'Ivoire.");
  const [params, setParams] = useSearchParams();
  // Un type inconnu ne doit pas vider silencieusement la liste : il retombe
  // sur « Tout », qui est ce que le visiteur attend d'un lien cassé.
  const typeDemande = params.get("type");
  const initialType: PlaceType | "all" =
    TYPES.find((t) => t.value === typeDemande)?.value ?? "all";
  const initialCity = params.get("city") ?? "all";

  const [type, setType] = useState<PlaceType | "all">(initialType);
  const [city, setCity] = useState<string>(initialCity);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("relevance");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data: places, loading, error, reload } = usePlaces();

  const results = useMemo(() => {
    const filtered = places.filter((p) => {
      if (type !== "all" && p.type !== type) return false;
      if (city !== "all" && p.city !== city) return false;
      if (q.trim()) {
        const needle = q.trim().toLowerCase();
        const hay = `${p.name} ${p.tagline} ${p.zone ?? ""} ${p.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    if (sort === "name_asc") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "standing_desc") return [...filtered].sort((a, b) => b.standing - a.standing);
    return filtered;
  }, [places, type, city, q, sort]);

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value === "all" || !value) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  };

  const activeCount = (type !== "all" ? 1 : 0) + (city !== "all" ? 1 : 0) + (sort !== "relevance" ? 1 : 0);

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

            {/* Sélecteur ville — desktop seulement */}
            <select
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                updateParam("city", e.target.value);
              }}
              className="hidden h-10 rounded-full border border-border bg-background px-4 text-sm font-medium outline-none focus:border-primary sm:block"
            >
              <option value="all">Toutes les villes</option>
              {CITIES.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>

            {/* Bouton filtres — mobile : ouvre Sheet */}
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <button
                  className="sm:hidden flex h-10 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium"
                  aria-label="Filtres"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtres
                  {activeCount > 0 && (
                    <span className="ml-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                      {activeCount}
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader>
                  <SheetTitle>Filtres & tri</SheetTitle>
                </SheetHeader>
                <div className="mt-4 space-y-5">
                  <div>
                    <p className="akw-eyebrow mb-2">Catégorie</p>
                    <div className="flex flex-wrap gap-2">
                      {TYPES.map((t) => (
                        <button
                          key={t.value}
                          onClick={() => {
                            setType(t.value);
                            updateParam("type", t.value);
                          }}
                          className={cn(
                            "akw-chip !py-1 !px-3 !text-xs",
                            type === t.value && "akw-chip-active",
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="akw-eyebrow mb-2">Ville</p>
                    <select
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        updateParam("city", e.target.value);
                      }}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="all">Toutes les villes</option>
                      {CITIES.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="akw-eyebrow mb-2">Trier par</p>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as Sort)}
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                    >
                      <option value="relevance">Pertinence</option>
                      <option value="name_asc">Nom (A → Z)</option>
                      <option value="standing_desc">Standing ↓</option>
                    </select>
                  </div>
                </div>
                <SheetFooter className="mt-5 flex-row gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setType("all");
                      setCity("all");
                      setSort("relevance");
                      updateParam("type", "all");
                      updateParam("city", "all");
                    }}
                  >
                    Réinitialiser
                  </Button>
                  <Button className="flex-1" onClick={() => setFiltersOpen(false)}>
                    Voir {results.length} résultats
                  </Button>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>

          {/* Chips catégories — desktop seulement (mobile via sheet) */}
          <div className="scrollbar-none hidden gap-2 overflow-x-auto sm:flex">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => {
                  setType(t.value);
                  updateParam("type", t.value);
                }}
                className={cn(
                  "akw-chip flex-shrink-0 !py-1 !px-3 !text-xs",
                  type === t.value && "akw-chip-active",
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
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="hidden sm:block h-9 rounded-full border border-border bg-background px-4 text-sm font-medium"
              aria-label="Trier"
            >
              <option value="relevance">Trier : Pertinence</option>
              <option value="name_asc">Trier : Nom</option>
              <option value="standing_desc">Trier : Standing ↓</option>
            </select>
          </div>

          {loading ? (
            <div className="akw-card flex flex-col items-center gap-3 px-6 py-16 text-center">
              <p className="text-sm text-muted-foreground">Chargement des adresses...</p>
            </div>
          ) : error ? (
            <div className="akw-card flex flex-col items-center gap-3 px-6 py-16 text-center">
              <h3 className="font-display text-xl font-semibold">Chargement impossible</h3>
              <p className="max-w-md text-sm text-muted-foreground">{error}</p>
              <button
                onClick={reload}
                className="mt-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium"
              >
                Réessayer
              </button>
            </div>
          ) : results.length === 0 ? (
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
