import { Link } from "react-router-dom";
import { ArrowRight, Hammer, Store } from "lucide-react";

import { CATEGORIES } from "@/modules/errands/domain";
import { ServiceDoors } from "@/modules/errands/ui/ServiceDoors";
import { ServicePriceExplainer } from "@/modules/errands/ui/ServicePriceExplainer";
import { ServiceProtection } from "@/modules/errands/ui/ServiceProtection";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

/**
 * Hub des services Akwaba.
 *
 * L'accueil est la porte courte : il annonce le service et laisse partir vers
 * la demande de course. Le hub est la page de celui qui veut comprendre avant
 * de s'engager. C'est donc ici, et non sur l'accueil, que vivent le détail du
 * prix, les garanties et l'accès au fonctionnement complet.
 *
 * La page tient en six blocs : promesse, les deux portes du service, ce qu'on
 * peut demander, ce que ça coûte, ce qui protège, et les deux autres façons de
 * travailler avec Akwaba. Un hub riche n'est pas un hub confus.
 */

/**
 * Les deux entrées qui ne s'adressent pas au client des courses. Elles restent
 * de plein droit dans le hub, mais après les portes du service : les confondre
 * ferait quatre choix de même poids là où deux seulement concernent la plupart
 * des visiteurs.
 */
const AUTRES_ENTREES = [
  {
    to: "/partner/signup",
    icon: Store,
    title: "Marchands & établissements",
    text: "Boutiques, maquis, hôtels, supermarchés : référencez-vous et recevez des commandes.",
    cta: "Inscrire mon commerce",
  },
  {
    to: "/courses/nouvelle?category=artisan",
    icon: Hammer,
    title: "Artisans & services",
    text: "Plombier, électricien, couturier, coiffure à domicile : demandez une intervention en 2 minutes.",
    cta: "Demander un artisan",
  },
];

export default function ServicesHubPage() {
  usePageTitle("Services", "Les services Akwaba, dont Akwaba Shopper.");

  return (
    <div className="akw-container py-6 lg:py-8">
      <header className="rounded-3xl bg-editorial px-6 py-8 text-background sm:px-10">
        <p className="akw-eyebrow text-background/70">Akwaba Services · Côte d'Ivoire</p>
        <h1 className="mt-2 max-w-2xl font-display text-2xl font-semibold leading-tight text-balance sm:text-3xl lg:text-4xl">
          Tout ce dont vous avez besoin, quelqu'un le fait pour vous.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-background/85 text-pretty">
          Le catalogue complet de ce qu'un shopper peut faire pour vous, ce que cela coûte et ce
          qui vous protège. Simple, traçable, ivoirien.
        </p>
        {/* Le fonctionnement complet a quitté l'accueil : sa place est ici, à
            portée de celui qui cherche à comprendre, sans concurrencer les
            deux actions qui suivent. */}
        <Link
          to="/courses/comment-ca-marche"
          className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-background/40 px-5 text-sm font-medium text-background transition-colors hover:border-background"
        >
          Comment ça marche
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </header>

      <section aria-labelledby="akw-catalogue-titre" className="mt-8">
        <h2 id="akw-catalogue-titre" className="font-display text-xl font-semibold text-foreground">
          Que peut-on vous faire faire ?
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
          Chaque catégorie ouvre le formulaire de demande avec le bon contexte déjà choisi.
        </p>
        <ul className="scrollbar-none mt-4 flex gap-2.5 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <li key={c.value}>
              <Link
                to={`/courses/nouvelle?category=${c.value}`}
                aria-label={`Demander une course : ${c.label}`}
                className="akw-card-hover flex h-full min-h-[96px] min-w-[150px] flex-col justify-center px-4 py-3"
              >
                <span className="text-xl" aria-hidden="true">
                  {c.emoji}
                </span>
                <span className="mt-1 text-sm font-medium text-foreground">{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ServiceDoors />

      <ServicePriceExplainer />

      <ServiceProtection />

      <section aria-labelledby="akw-autres-titre" className="mt-8">
        <h2 id="akw-autres-titre" className="font-display text-xl font-semibold text-foreground">
          Deux autres façons de travailler avec Akwaba
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {AUTRES_ENTREES.map(({ to, icon: Icone, title, text, cta }) => (
            <li key={to}>
              <Link to={to} className="akw-card-hover group flex h-full flex-col p-5">
                <Icone className="h-6 w-6 text-primary" aria-hidden="true" />
                <h3 className="mt-3 font-display text-lg font-semibold text-foreground">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground text-pretty">{text}</p>
                <span className="mt-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-primary">
                  {cta}
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
