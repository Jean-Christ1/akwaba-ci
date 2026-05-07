import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  Heart,
  MapPin,
  Navigation,
  Phone,
  Share2,
  Star,
  Mail,
  Globe,
} from "lucide-react";
import { getPlaceBySlug, PLACES } from "@/modules/places/infrastructure/data";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { useFavorites } from "@/modules/favorites/application/useFavorites";
import { LeadRequestForm } from "@/modules/leads/ui/LeadRequestForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CalendarCheck } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";

export default function PlaceDetailPage() {
  const { slug } = useParams();
  const place = slug ? getPlaceBySlug(slug) : undefined;
  const { has, toggle } = useFavorites();

  if (!place) {
    return (
      <div className="akw-container py-24 text-center">
        <h1 className="font-display text-3xl font-semibold">Adresse introuvable</h1>
        <p className="mt-3 text-muted-foreground">Le lieu que vous cherchez n'existe pas ou a été déplacé.</p>
        <Link to="/explorer" className="mt-6 inline-flex rounded-full bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground">
          Retour à l'exploration
        </Link>
      </div>
    );
  }

  const fav = has(place.id);
  const nearby = PLACES.filter((p) => p.id !== place.id && p.city === place.city).slice(0, 4);
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${place.coords.lat},${place.coords.lng}`;
  const waUrl = place.whatsapp ? `https://wa.me/${place.whatsapp.replace(/[^0-9]/g, "")}` : null;
  const telUrl = place.phone ? `tel:${place.phone}` : null;

  return (
    <article className="bg-background pb-32 lg:pb-16">
      {/* HERO */}
      <header className="relative">
        <div className="relative aspect-[16/10] w-full overflow-hidden lg:aspect-[21/9] lg:max-h-[640px]">
          <img
            src={place.image}
            alt={place.name}
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-editorial/80 via-transparent to-editorial/30" />

          <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4 sm:p-6">
            <Link
              to="/explorer"
              aria-label="Retour"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigator.share?.({ title: place.name, url: location.href }).catch(() => {})}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur"
                aria-label="Partager"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => toggle(place.id)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 backdrop-blur"
                aria-label={fav ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                <Heart className={cn("h-4 w-4", fav && "fill-destructive text-destructive")} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="akw-container -mt-16 sm:-mt-20 lg:-mt-24 relative z-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* COLONNE PRINCIPALE */}
          <div className="space-y-8">
            <div className="akw-card p-6 sm:p-8 animate-fade-in">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="akw-eyebrow">{place.zone ?? place.city} · {place.priceBand}</p>
                  <h1 className="mt-2 font-display text-3xl font-semibold leading-tight sm:text-4xl text-balance">
                    {place.name}
                  </h1>
                  <p className="mt-2 text-base text-muted-foreground text-pretty">{place.tagline}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  {Array.from({ length: place.standing }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-accent text-accent" />
                  ))}
                </div>
              </div>

              {place.curatorNote && (
                <blockquote className="mt-5 border-l-2 border-accent bg-accent-soft/40 py-3 pl-4 pr-3">
                  <p className="text-sm italic text-foreground">« {place.curatorNote} »</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                    — Note de notre équipe
                  </p>
                </blockquote>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-5 sm:grid-cols-4">
                <InfoBlock icon={MapPin} label="Adresse" value={place.zone ?? place.city} />
                <InfoBlock
                  icon={Clock}
                  label="Aujourd'hui"
                  value={place.hours.today ?? (place.hours.open ? "Ouvert" : "Fermé")}
                  status={place.hours.open ? "success" : "destructive"}
                />
                <InfoBlock icon={Star} label="Standing" value={`${place.standing} / 5`} />
                <InfoBlock icon={Navigation} label="Coords" value={`${place.coords.lat.toFixed(3)}°`} />
              </div>
            </div>

            {/* POURQUOI */}
            <section>
              <p className="akw-eyebrow mb-3">Pourquoi y aller</p>
              <ul className="space-y-2.5">
                {place.whyVisit.map((w, i) => (
                  <li key={i} className="flex gap-3 text-[15px] text-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent" />
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>

            {/* DESCRIPTION */}
            <section>
              <p className="akw-eyebrow mb-3">L'adresse</p>
              <p className="akw-prose text-pretty">{place.description}</p>
            </section>

            {/* DETAILS ACCORDION */}
            <Accordion type="multiple" defaultValue={["story"]} className="w-full">
              {place.story && (
                <AccordionItem value="story">
                  <AccordionTrigger className="font-display text-lg">Histoire & contexte</AccordionTrigger>
                  <AccordionContent className="akw-prose text-pretty">{place.story}</AccordionContent>
                </AccordionItem>
              )}
              <AccordionItem value="services">
                <AccordionTrigger className="font-display text-lg">Services & équipements</AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-2">
                    {place.services.map((s) => (
                      <span key={s} className="akw-chip">{s}</span>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="recommendations">
                <AccordionTrigger className="font-display text-lg">Pour qui & quand</AccordionTrigger>
                <AccordionContent className="space-y-3 text-sm">
                  <p><strong className="text-foreground">Recommandé pour : </strong>{place.bestFor.join(" · ")}</p>
                  {place.bestTime && <p><strong className="text-foreground">Meilleur moment : </strong>{place.bestTime}</p>}
                  {place.averageDuration && <p><strong className="text-foreground">Durée moyenne : </strong>{place.averageDuration}</p>}
                </AccordionContent>
              </AccordionItem>
              {place.practicalTips && place.practicalTips.length > 0 && (
                <AccordionItem value="tips">
                  <AccordionTrigger className="font-display text-lg">À savoir</AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 text-sm">
                      {place.practicalTips.map((t, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent">·</span>
                          {t}
                        </li>
                      ))}
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>

            {/* À PROXIMITÉ */}
            {nearby.length > 0 && (
              <section>
                <p className="akw-eyebrow mb-4">À proximité</p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {nearby.map((p) => (
                    <PlaceCard key={p.id} place={p} variant="compact" />
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* COLONNE CONTACT (desktop) */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-3">
              <div className="akw-card p-6">
                <p className="akw-eyebrow mb-4">Contacter directement</p>
                <div className="space-y-2.5">
                  {(place.type === "lodging" || place.type === "restaurant") && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <button className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-accent-foreground transition-transform hover:-translate-y-0.5">
                          <CalendarCheck className="h-4 w-4" />
                          {place.type === "lodging" ? "Demander une réservation" : "Réserver une table"}
                        </button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader><DialogTitle className="font-display">Demande de réservation</DialogTitle></DialogHeader>
                        <LeadRequestForm placeId={place.id} placeName={place.name} kind={place.type === "lodging" ? "lodging" : "restaurant"} />
                      </DialogContent>
                    </Dialog>
                  )}
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
                  >
                    <Navigation className="h-4 w-4" />
                    Itinéraire
                  </a>
                  {waUrl && (
                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                    >
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </a>
                  )}
                  {telUrl && (
                    <a
                      href={telUrl}
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
                    >
                      <Phone className="h-4 w-4" />
                      Appeler
                    </a>
                  )}
                  {place.email && (
                    <a
                      href={`mailto:${place.email}`}
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-muted"
                    >
                      <Mail className="h-4 w-4" />
                      Email
                    </a>
                  )}
                  {place.website && (
                    <a
                      href={place.website}
                      target="_blank"
                      rel="noreferrer"
                      className="flex w-full items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-3 text-sm font-semibold hover:bg-muted"
                    >
                      <Globe className="h-4 w-4" />
                      Site web
                    </a>
                  )}
                </div>

                <div className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">
                  <p>Adresse vérifiée · Mise à jour récemment</p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* CTA STICKY MOBILE */}
      <div className="fixed bottom-16 left-0 right-0 z-30 border-t border-border bg-background/95 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-lg lg:hidden">
        <div className="flex gap-2">
          {waUrl && (
            <a
              href={waUrl}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border bg-background py-3 text-sm font-semibold"
            >
              <Phone className="h-4 w-4" /> WhatsApp
            </a>
          )}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary py-3 text-sm font-semibold text-primary-foreground"
          >
            <Navigation className="h-4 w-4" /> Itinéraire
          </a>
        </div>
      </div>
    </article>
  );
}

function InfoBlock({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  status?: "success" | "destructive";
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <p
        className={cn(
          "mt-1 text-sm font-medium",
          status === "success" && "text-success",
          status === "destructive" && "text-destructive"
        )}
      >
        {value}
      </p>
    </div>
  );
}
