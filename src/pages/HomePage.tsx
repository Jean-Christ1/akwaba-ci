import { Link } from "react-router-dom";
import { Search, Sparkles, ArrowRight } from "lucide-react";
import heroImg from "@/assets/hero-abidjan.jpg";
import { CITIES, ITINERARIES, PLACES } from "@/modules/places/infrastructure/data";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";
import { ItineraryCard } from "@/modules/places/ui/ItineraryCard";
import { CategoryChip, SectionHeader } from "@/shared/ui/sections";

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
  const featured = PLACES.filter((p) => p.premium).slice(0, 4);
  const tonight = PLACES.filter((p) => p.type === "restaurant" || p.type === "maquis").slice(0, 4);

  return (
    <div>
      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="relative h-[78vh] min-h-[560px] max-h-[820px] w-full">
          <img
            src={heroImg}
            alt="Abidjan vue depuis la lagune Ébrié au coucher du soleil"
            width={1920}
            height={1080}
            className="absolute inset-0 h-full w-full object-cover"
            fetchPriority="high"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-editorial/20 via-editorial/40 to-editorial" />

          <div className="akw-container relative z-10 flex h-full flex-col justify-end pb-16 sm:pb-24">
            <div className="max-w-2xl animate-slide-up">
              <p className="akw-eyebrow text-background/70 mb-4">
                Côte d'Ivoire · Compagnon de voyage premium
              </p>
              <h1 className="font-display text-4xl font-semibold leading-[1.05] text-background sm:text-5xl lg:text-6xl text-balance">
                {getGreeting()}. Voici ce qui vaut le détour, près de vous.
              </h1>
              <p className="mt-5 max-w-xl text-base text-background/85 sm:text-lg text-pretty">
                Hôtels, tables, lieux et parcours sélectionnés à Abidjan, Grand-Bassam, Assinie et
                Yamoussoukro. Choisis avec soin. Vérifiés régulièrement.
              </p>

              <Link
                to="/explorer"
                className="mt-8 inline-flex w-full max-w-lg items-center gap-3 rounded-full bg-background/95 px-5 py-4 text-left shadow-elevation-2 backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:w-auto"
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
      <section className="py-12 sm:py-16">
        <div className="akw-container">
          <SectionHeader
            eyebrow="La sélection Akwaba"
            title="Les adresses qui méritent vraiment le déplacement"
            description="Une curation resserrée plutôt qu'un annuaire. Chaque lieu est visité, contrôlé, mis à jour."
            ctaLabel="Tout voir"
            ctaTo="/explorer"
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        </div>
      </section>

      {/* CE SOIR */}
      <section className="bg-secondary/40 py-12 sm:py-16">
        <div className="akw-container">
          <SectionHeader
            eyebrow="Ce soir près de vous"
            title="Bien dîner, sans hésiter"
            description="Trois adresses pour trois envies : fine dining, maquis local, atmosphère chic."
            ctaLabel="Voir tous les restos"
            ctaTo="/explorer?type=restaurant"
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {tonight.map((p) => (
              <PlaceCard key={p.id} place={p} />
            ))}
          </div>
        </div>
      </section>

      {/* PARCOURS */}
      <section className="py-12 sm:py-16">
        <div className="akw-container">
          <SectionHeader
            eyebrow="Parcours prêts à vivre"
            title="Des itinéraires pensés par notre équipe"
            description="48h à Abidjan, week-end à Assinie, journée à Bassam : suivez le fil, gardez votre énergie."
            ctaLabel="Tous les parcours"
            ctaTo="/parcours"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {ITINERARIES.slice(0, 2).map((it) => (
              <ItineraryCard key={it.id} itinerary={it} />
            ))}
          </div>
        </div>
      </section>

      {/* VILLES */}
      <section className="bg-secondary/40 py-12 sm:py-16">
        <div className="akw-container">
          <SectionHeader
            eyebrow="Destinations"
            title="Où voulez-vous aller ?"
            description="Phase 1 : nous couvrons quatre villes en profondeur. D'autres suivront."
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {CITIES.map((city) => (
              <Link
                key={city.slug}
                to={`/explorer?city=${city.slug}`}
                className="akw-card-hover group relative block overflow-hidden"
              >
                <div className="relative aspect-[3/4] overflow-hidden">
                  <img
                    src={city.image}
                    alt={city.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-editorial via-editorial/20 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-5 text-editorial-foreground">
                    <p className="akw-eyebrow text-editorial-foreground/70">{city.region}</p>
                    <h3 className="mt-1 font-display text-2xl font-semibold">{city.name}</h3>
                    <p className="mt-1 text-sm text-editorial-foreground/80">{city.tagline}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* PROMESSE */}
      <section className="border-t border-border bg-background py-16 sm:py-20">
        <div className="akw-container max-w-3xl text-center">
          <Sparkles className="mx-auto h-6 w-6 text-accent" />
          <h2 className="mt-4 font-display text-3xl font-semibold text-balance sm:text-4xl">
            Découvrir la Côte d'Ivoire facilement, élégamment et en toute confiance.
          </h2>
          <p className="mt-4 text-muted-foreground text-pretty">
            Pas un annuaire. Une équipe sur le terrain, des fiches courtes et utiles, des contacts
            directs, une cartographie qui ne vous trahit pas.
          </p>
          <Link
            to="/explorer"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            Commencer à explorer
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
