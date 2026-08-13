import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useFavorites } from "@/modules/favorites/application/useFavorites";
import { usePlacesByIds } from "@/modules/places/application/usePlaces";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

export default function FavoritesPage() {
  usePageTitle("Mes favoris", "Votre carnet d'adresses personnel.");
  const { ids } = useFavorites();
  const { data: places, loading, error, reload } = usePlacesByIds(ids);

  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card">
        <div className="akw-container py-5 sm:py-6">
          <p className="akw-eyebrow mb-1">Vos favoris</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">
            Votre carnet d'adresses
          </h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Tous les lieux que vous avez sauvegardés. Construisez votre programme à partir d'ici.
          </p>
        </div>
      </section>

      <section className="py-6 sm:py-8">
        <div className="akw-container">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Chargement de vos adresses...
            </p>
          ) : error ? (
            <div className="akw-card mx-auto max-w-md px-6 py-12 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                onClick={reload}
                className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-medium"
              >
                Réessayer
              </button>
            </div>
          ) : places.length === 0 ? (
            <div className="akw-card mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Heart className="h-5 w-5 text-muted-foreground" />
              </div>
              <h2 className="font-display text-xl font-semibold">Aucun lieu sauvegardé</h2>
              <p className="text-sm text-muted-foreground">
                Touchez ♡ sur n'importe quelle fiche pour la retrouver ici.
              </p>
              <Link
                to="/explorer"
                className="mt-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Explorer les lieux
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {places.map((p) => (
                <PlaceCard key={p.id} place={p} />
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
