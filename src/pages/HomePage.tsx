import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-abidjan.jpg";
import { ITINERARIES } from "@/modules/places/infrastructure/data";
import { useCatalogCities } from "@/modules/places/application/useCatalogCities";
import { usePlaces } from "@/modules/places/application/usePlaces";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { ItineraryCard } from "@/modules/places/ui/ItineraryCard";
import { CategoryChip, SectionHeader } from "@/shared/ui/sections";
import { HorizontalRail } from "@/shared/ui/HorizontalRail";
import { OtherServicesSection } from "@/shared/ui/OtherServicesSection";
import { ShopperSpotlight } from "@/modules/errands/ui/ShopperSpotlight";
import { usePageTitle } from "@/shared/hooks/usePageTitle";
import { UniverseSwitch } from "@/shared/ui/UniverseSwitch";
import { ecrireUnivers, lireUnivers, type Univers } from "@/shared/ui/univers";

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
  // Les villes fermees en console disparaissent de l'accueil.
  const { cities: CITIES } = useCatalogCities();

  // L'accueil empilait les deux metiers l'un sous l'autre : il fallait faire
  // defiler six blocs de decouverte avant d'en voir le bout, et les deux
  // services se diluaient l'un dans l'autre. On n'en montre plus qu'un a la
  // fois, si bien que la page redevient courte et que chaque univers garde
  // son intention propre.
  const [univers, setUnivers] = useState<Univers>(() => lireUnivers());
  const changerUnivers = (u: Univers) => {
    setUnivers(u);
    ecrireUnivers(u);
  };
  const enCourses = univers === "courses";

  usePageTitle(
    enCourses ? "Vos courses faites pour vous" : "Découvrir la Côte d'Ivoire",
    enCourses
      ? "Confiez vos courses à un shopper vérifié, partout en Côte d'Ivoire."
      : "Adresses sélectionnées, parcours et séjours en Côte d'Ivoire."
  );
  const { data: places, loading, error, reload } = usePlaces();
  const featured = places.filter((p) => p.premium).slice(0, 4);
  const tonight = places
    .filter((p) => p.type === "restaurant" || p.type === "maquis")
    .slice(0, 4);

  return (
    <div>
      {/* HERO - compact, sub-fold visible */}
      <section className="relative overflow-hidden">
        <div className="relative h-[62vh] min-h-[440px] max-h-[640px] w-full">
          <img
            src={heroImg}
            alt="Abidjan vue depuis la lagune Ébrié au coucher du soleil"
            width={1920}
            height={1080}
            className="absolute inset-0 h-full w-full object-cover"
            {...{ fetchpriority: "high" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-editorial/20 via-editorial/40 to-editorial" />

          <div className="akw-container relative z-10 flex h-full flex-col justify-end pb-10 sm:pb-14">
            <div className="max-w-2xl animate-slide-up">
              <p className="akw-eyebrow text-background/70 mb-3">
                Côte d'Ivoire · Courses et services du quotidien
              </p>
              {/* La première ligne dit le service principal. Elle annonçait
                  jusqu'ici les hôtels et les parcours, ce qui plaçait la
                  découverte devant la promesse et laissait le visiteur
                  découvrir le Shopper plus bas, s'il faisait défiler. */}
              <h1 className="font-display text-3xl font-semibold leading-[1.05] text-background sm:text-4xl lg:text-5xl text-balance">
                {getGreeting()}. Vos courses faites pour vous, sans vous déplacer.
              </h1>
              <p className="mt-3 max-w-xl text-sm text-background/85 sm:text-base text-pretty">
                Un shopper vérifié va au marché, en pharmacie ou au supermarché à votre place.
                Et quand vous cherchez où sortir, le meilleur de la Côte d'Ivoire reste juste en dessous.
              </p>

              <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Link
                  to="/courses/nouvelle"
                  className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-elevation-2 transition-transform hover:-translate-y-0.5"
                >
                  Demander une course
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>

                <Link
                  to="/explorer"
                  className="inline-flex min-h-[48px] flex-1 items-center gap-3 rounded-full bg-background/95 px-5 text-left shadow-elevation-2 backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:max-w-md"
                >
                  <Search className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="flex-1 text-sm text-muted-foreground">
                    Restaurant, hôtel, lieu, parcours…
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bascule entre les deux univers. Elle est placee immediatement sous
          le heros, la ou le visiteur decide de ce qu il vient chercher, et
          reste collante pour rester atteignable pendant le defilement. */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/95 py-3 backdrop-blur-lg">
        <div className="akw-container flex items-center justify-center">
          <UniverseSwitch valeur={univers} onChange={changerUnivers} />
        </div>
      </div>

      {/* Un seul univers a la fois : c'est ce qui garde la page courte. */}
      {enCourses ? (
        <>
          {/* Univers courses : le service principal, seul a l ecran. */}
        <ShopperSpotlight />
  
        </>
      ) : (
        <>
          {/* Univers decouverte : lieux, tables, parcours et villes. */}
        <OtherServicesSection />
  
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
  
        </>
      )}
      {/* PROMESSE - compact */}
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
