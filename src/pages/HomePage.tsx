import { Link } from "react-router-dom";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-abidjan.jpg";
import { CITIES, ITINERARIES } from "@/modules/places/infrastructure/data";
import { usePlaces } from "@/modules/places/application/usePlaces";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { ItineraryCard } from "@/modules/places/ui/ItineraryCard";
import { CategoryChip, SectionHeader } from "@/shared/ui/sections";
import { HorizontalRail } from "@/shared/ui/HorizontalRail";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

const CATEGORIES = [
  { to: "/explorer?type=lodging", label: "Hébergements", emoji: "🏨" },
  { to: "/explorer?type=restaurant", label: "Restaurants", emoji: "🍽️" },
  { to: "/explorer?type=maquis", label: "Maquis", emoji: "🔥" },
  { to: "/explorer?type=culture", label: "Culture", emoji: "🏛️" },
  { to: "/explorer?type=beach", label: "Plages", emoji: "🌊" },
  { to: "/explorer?type=nightlife", label: "Sorties", emoji: "✨" },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonsoir";
}

export default function HomePage() {
  usePageTitle("Découvrir la Côte d'Ivoire", "Adresses sélectionnées, parcours et service de courses en Côte d'Ivoire.");
  const { data: places, loading, error, reload } = usePlaces();
  const featured = places.filter((p) => p.premium).slice(0, 4);
  const tonight = places
    .filter((p) => p.type === "restaurant" || p.type === "maquis")
    .slice(0, 4);

  return (
    <div>
      {/* HERO — compact, sub-fold visible */}
      <section className="relative overflow-hidden">
        <div className="relative h-[62vh] min-h-[440px] max-h-[640px] w-full">
          <img
            src={heroImg}
            alt="Abidjan vue depuis la lagune Ébrié au coucher du soleil"
            width={1920}
            height={1080}
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-editorial/20 via-editorial/40 to-editorial" />

          <div className="akw-container relative z-10 flex h-full flex-col justify-end pb-10 sm:pb-14">
            <div className="max-w-2xl animate-slide-up">
              <p className="akw-eyebrow text-background/70 mb-3">
                Côte d'Ivoire · Compagnon de voyage premium
              </p>
              <h1 className="font-display text-3xl font-semibold leading-[1.05] text-background sm:text-4xl lg:text-5xl text-balance">
                {getGreeting()}. Voici ce qui vaut le détour, près de vous.
              </h1>
              <p className="mt-3 max-w-xl text-sm text-background/85 sm:text-base text-pretty">
                Hôtels, tables, lieux et parcours sélectionnés à Abidjan, Bassam, Assinie, Yamoussoukro.
              </p>

              <Link
                to="/explorer"
                className="mt-5 inline-flex w-full max-w-lg items-center gap-3 rounded-full bg-background/95 px-5 py-3 text-left shadow-elevation-2 backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:w-auto"
              >
                <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-muted-foreground">
                  Restaurant, hôtel, lieu, parcours…
                </span>
                <span className="hidden rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground sm:inline">
                  Rechercher
                </span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* CATÉGORIES */}
      <section className="border-b border-border/60 bg-background py-5">
        <div className="akw-container">
          <div className="scrollbar-none flex gap-2.5 overflow-x-auto">
            {CATEGORIES.map((c) => (
              <CategoryChip key={c.to} {...c} />
            ))}
          </div>
        </div>
      </section>

      {/* SÉLECTION AKWABA */}
      <section className="py-8 sm:py-12">
        <div className="akw-container">
          <SectionHeader
            eyebrow="La sélection Akwaba"
            title="Les adresses qui méritent vraiment le déplacement"
            description="Une curation resserrée plutôt qu'un annuaire. Chaque lieu est visité, contrôlé, mis à jour."
            ctaLabel="Tout voir"
            ctaTo="/explorer"
          />
          {error ? (
            <div className="akw-card px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                onClick={reload}
                className="mt-3 rounded-full border border-border px-5 py-2.5 text-sm font-medium"
              >
                Réessayer
              </button>
            </div>
          ) : loading ? (
            <div className="akw-card px-6 py-10 text-center text-sm text-muted-foreground">
              Chargement de la sélection...
            </div>
          ) : (
            <HorizontalRail desktopCols={4}>
              {featured.map((p) => (
                <PlaceCard key={p.id} place={p} />
              ))}
            </HorizontalRail>
          )}
        </div>
      </section>

      {/* CE SOIR */}
      <section className="bg-secondary/40 py-8 sm:py-12">
        <div className="akw-container">
          <SectionHeader
            eyebrow="Ce soir près de vous"
            title="Bien dîner, sans hésiter"
            description="Trois adresses pour trois envies : fine dining, maquis local, atmosphère chic."
            ctaLabel="Voir tous les restos"
            ctaTo="/explorer?type=restaurant"
          />
          <HorizontalRail desktopCols={4}>
            {tonight.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </HorizontalRail>
        </div>
      </section>

      {/* PARCOURS */}
      <section className="py-8 sm:py-12">
        <div className="akw-container">
          <SectionHeader
            eyebrow="Parcours prêts à vivre"
            title="Des itinéraires pensés par notre équipe"
            description="48h à Abidjan, week-end à Assinie, journée à Bassam : suivez le fil, gardez votre énergie."
            ctaLabel="Tous les parcours"
            ctaTo="/parcours"
          />
          <HorizontalRail desktopCols={2}>
            {ITINERARIES.slice(0, 2).map((it) => (
              <ItineraryCard key={it.id} itinerary={it} />
            ))}
          </HorizontalRail>
        </div>
      </section>

      {/* VILLES */}
      <section className="bg-secondary/40 py-8 sm:py-12">
        <div className="akw-container">
          <SectionHeader
            eyebrow="Destinations"
            title="Où voulez-vous aller ?"
            description="Phase 1 : nous couvrons quatre villes en profondeur. D'autres suivront."
          />
          <HorizontalRail desktopCols={4}>
            {CITIES.map((city) => (
              <Link
                key={city.slug}
                to={`/explorer?city=${city.slug}`}
                className="akw-card-hover group relative block overflow-hidden"
              >
                <div className="relative aspect-[4/5] overflow-hidden">
                  <img
                    src={city.image}
                    alt={city.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-editorial via-editorial/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-editorial-foreground">
                    <p className="akw-eyebrow text-editorial-foreground/70">{city.region}</p>
                    <h3 className="mt-1 font-display text-xl font-semibold">{city.name}</h3>
                    <p className="mt-0.5 text-xs text-editorial-foreground/80 line-clamp-1">{city.tagline}</p>
                  </div>
                </div>
              </Link>
            ))}
          </HorizontalRail>
        </div>
      </section>

      {/* PROMESSE — compact */}
      <section className="border-t border-border bg-background py-10 sm:py-14">
        <div className="akw-container max-w-3xl text-center">
          <Sparkles className="mx-auto h-5 w-5 text-accent" />
          <h2 className="mt-3 font-display text-2xl font-semibold text-balance sm:text-3xl">
            Découvrir la Côte d'Ivoire facilement, élégamment et en toute confiance.
          </h2>
          <Link
            to="/explorer"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Commencer à explorer
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
