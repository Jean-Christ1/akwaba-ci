import { Link } from "react-router-dom";
import { Clock, Users } from "lucide-react";
import type { Itinerary } from "@/modules/places/domain/types";

export function ItineraryCard({ itinerary }: { itinerary: Itinerary }) {
  return (
    <Link
      to={`/parcours/${itinerary.slug}`}
      className="akw-card-hover group relative block overflow-hidden"
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        <img
          src={itinerary.image}
          alt={itinerary.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-editorial via-editorial/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-editorial-foreground">
          <p className="akw-eyebrow text-editorial-foreground/70">Parcours · {itinerary.persona}</p>
          <h3 className="mt-1 font-display text-2xl font-semibold leading-tight text-balance">
            {itinerary.title}
          </h3>
          <p className="mt-1 text-sm text-editorial-foreground/80">{itinerary.subtitle}</p>
          <div className="mt-3 flex items-center gap-4 text-xs text-editorial-foreground/80">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {itinerary.durationHours <= 24 ? `${itinerary.durationHours}h` : `${itinerary.durationHours / 24} jours`}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {itinerary.budgetBand}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
