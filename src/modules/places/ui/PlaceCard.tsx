import { memo } from "react";
import { Link } from "react-router-dom";
import { Heart, MapPin, Star } from "lucide-react";
import type { Place } from "@/modules/places/domain/types";
import { useFavorites } from "@/modules/favorites/application/useFavorites";
import { cn } from "@/lib/utils";
import { PlaceImage } from "@/shared/ui/PlaceImage";

const TYPE_LABEL: Record<Place["type"], string> = {
  lodging: "Hébergement",
  restaurant: "Restaurant",
  maquis: "Maquis",
  attraction: "Lieu emblématique",
  beach: "Plage",
  nightlife: "Sortie",
  culture: "Culture",
  shopping: "Shopping",
};

interface PlaceCardProps {
  place: Place;
  variant?: "default" | "compact" | "editorial";
  className?: string;
}

function PlaceCardBase({ place, variant = "default", className }: PlaceCardProps) {
  const { has, toggle } = useFavorites();
  const fav = has(place.id);

  if (variant === "compact") {
    return (
      <Link
        to={`/lieu/${place.slug}`}
        className={cn("akw-card-hover group flex gap-3 p-3", className)}
      >
        <PlaceImage
          src={place.image}
          alt={place.name}
          className="h-20 w-20 flex-shrink-0 rounded-lg object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="akw-eyebrow">{TYPE_LABEL[place.type]}</p>
          <h3 className="font-display text-base font-semibold leading-tight truncate">
            {place.name}
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span className="truncate">{place.zone ?? place.city}</span>
            <span className="mx-1">·</span>
            <span>{place.priceBand}</span>
          </p>
        </div>
      </Link>
    );
  }

  return (
    /* Le bouton favori était imbriqué dans le lien de la carte. Un contrôle
       interactif dans une ancre n'est pas du HTML valide, et le dépôt le note
       déjà ailleurs : la carte devient imprévisible au toucher comme au
       clavier, où le bouton se parcourt à l'intérieur du lien. Il sort donc du
       lien et se pose au-dessus, la carte gardant son unique zone cliquable. */
    <article className={cn("akw-card-hover group relative", className)}>
      <button
        type="button"
        onClick={() => toggle(place.id)}
        aria-label={
          fav ? `Retirer ${place.name} des favoris` : `Ajouter ${place.name} aux favoris`
        }
        aria-pressed={fav}
        className="absolute right-3 top-3 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-background/90 backdrop-blur-md transition-transform hover:scale-105"
      >
        <Heart
          className={cn(
            "h-4 w-4 transition-colors",
            fav ? "fill-destructive text-destructive" : "text-foreground"
          )}
        />
      </button>

      <Link to={`/lieu/${place.slug}`} className="block">
      <div className="relative aspect-[4/3] overflow-hidden">
        <PlaceImage
          src={place.image}
          alt={place.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3">
          {place.premium && <span className="akw-badge-premium">Sélection</span>}
        </div>
      </div>
      <div className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="akw-eyebrow">{TYPE_LABEL[place.type]}</p>
          <div className="flex items-center gap-0.5">
            {Array.from({ length: place.standing }).map((_, i) => (
              <Star key={i} className="h-3 w-3 fill-accent text-accent" />
            ))}
          </div>
        </div>
        <h3 className="font-display text-lg font-semibold leading-snug text-balance">
          {place.name}
        </h3>
        <p className="line-clamp-2 text-sm text-muted-foreground">{place.tagline}</p>
        <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {place.zone ?? place.city}
          </span>
          <span className="font-medium text-foreground">{place.priceBand}</span>
        </div>
      </div>
      </Link>
    </article>
  );
}

export const PlaceCard = memo(PlaceCardBase);
