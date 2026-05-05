import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import { useFavorites } from "@/modules/favorites/application/useFavorites";
import { PLACES } from "@/modules/places/infrastructure/data";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";

export default function FavoritesPage() {
  const { ids } = useFavorites();
  const places = PLACES.filter((p) => ids.includes(p.id));

  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card">
        <div className="akw-container py-8">
          <p className="akw-eyebrow mb-2">Vos favoris</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Votre carnet d'adresses
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Tous les lieux que vous avez sauvegardés. Construisez votre programme à partir d'ici.
          </p>
        </div>
      </section>

      <section className="py-10">
        <div className="akw-container">
          {places.length === 0 ? (
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
