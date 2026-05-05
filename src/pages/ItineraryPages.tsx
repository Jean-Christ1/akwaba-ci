import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Clock, MapPin } from "lucide-react";
import {
  ITINERARIES,
  getItineraryBySlug,
  getPlacesByIds,
} from "@/modules/places/infrastructure/data";
import { ItineraryCard } from "@/modules/places/ui/ItineraryCard";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";

export function ItinerariesPage() {
  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card">
        <div className="akw-container py-8">
          <p className="akw-eyebrow mb-2">Parcours</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Des itinéraires prêts à vivre
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Pensés par notre équipe en Côte d'Ivoire, équilibrés en temps, distance et budget.
          </p>
        </div>
      </section>
      <section className="py-10">
        <div className="akw-container grid grid-cols-1 gap-6 sm:grid-cols-2">
          {ITINERARIES.map((it) => (
            <ItineraryCard key={it.id} itinerary={it} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function ItineraryDetailPage() {
  const { slug } = useParams();
  const it = slug ? getItineraryBySlug(slug) : undefined;

  if (!it) {
    return (
      <div className="akw-container py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">Parcours introuvable</h1>
        <Link to="/parcours" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
          Tous les parcours
        </Link>
      </div>
    );
  }

  const places = getPlacesByIds(it.steps.map((s) => s.placeId));

  return (
    <div className="bg-background pb-16">
      <header className="relative">
        <div className="relative aspect-[16/9] w-full overflow-hidden lg:max-h-[520px]">
          <img src={it.image} alt={it.title} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-editorial via-editorial/40 to-editorial/20" />
          <Link
            to="/parcours"
            className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="akw-container absolute inset-x-0 bottom-0 pb-8 text-editorial-foreground">
            <p className="akw-eyebrow text-editorial-foreground/70">{it.persona}</p>
            <h1 className="mt-2 font-display text-3xl font-semibold sm:text-5xl text-balance">{it.title}</h1>
            <p className="mt-2 max-w-2xl text-base text-editorial-foreground/85">{it.subtitle}</p>
            <div className="mt-4 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {it.durationHours <= 24 ? `${it.durationHours}h` : `${it.durationHours / 24} jours`}</span>
              <span>{it.budgetBand}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="akw-container mt-10">
        <p className="akw-eyebrow mb-4">Le déroulé</p>
        <ol className="space-y-6">
          {it.steps.map((step, idx) => {
            const place = places.find((p) => p.id === step.placeId);
            if (!place) return null;
            return (
              <li key={step.position} className="grid grid-cols-[auto_1fr] gap-4 sm:gap-6">
                <div className="flex flex-col items-center">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary font-display text-base font-semibold text-primary-foreground">
                    {step.position}
                  </div>
                  {idx < it.steps.length - 1 && <div className="mt-2 h-full w-px bg-border" />}
                </div>
                <div className="space-y-3 pb-2">
                  <p className="text-sm font-medium text-primary">{step.suggestedTime}</p>
                  <PlaceCard place={place} variant="compact" />
                  {step.transportHint && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {step.transportHint}
                    </p>
                  )}
                  {step.notes && <p className="text-sm text-muted-foreground italic">« {step.notes} »</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
