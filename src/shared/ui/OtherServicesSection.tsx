import { Link } from "react-router-dom";
import { Compass, Heart, Map, Route } from "lucide-react";

/**
 * Index sobre des verticales de découverte.
 *
 * Ces quatre écrans existaient déjà, dispersés dans la page et dans la
 * navigation. Les regrouper sous un intitulé unique les rend accessibles en un
 * coup d'œil sans leur donner le poids visuel du service Shopper, qui reste le
 * produit principal.
 */
const SERVICES = [
  {
    to: "/explorer",
    icon: Compass,
    label: "Explorer les lieux",
    texte: "Hôtels, restaurants, maquis et adresses culturelles vérifiés.",
  },
  {
    to: "/carte",
    icon: Map,
    label: "La carte",
    texte: "Voir ce qui se trouve autour de vous, quartier par quartier.",
  },
  {
    to: "/parcours",
    icon: Route,
    label: "Les parcours",
    texte: "Des itinéraires prêts à suivre, préparés par notre équipe.",
  },
  {
    to: "/favoris",
    icon: Heart,
    label: "Vos favoris",
    texte: "Retrouver les adresses que vous avez mises de côté.",
  },
];

export function OtherServicesSection() {
  return (
    <section
      aria-labelledby="akw-autres-services-titre"
      className="border-b border-border/60 bg-background py-7 sm:py-9"
    >
      <div className="akw-container">
        <p className="akw-eyebrow">Découverte</p>
        <h2
          id="akw-autres-services-titre"
          className="mt-1.5 font-display text-xl font-semibold text-foreground sm:text-2xl"
        >
          Les autres services Akwaba
        </h2>

        <ul className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {SERVICES.map(({ to, icon: Icone, label, texte }) => (
            <li key={to}>
              <Link
                to={to}
                className="flex h-full min-h-[76px] flex-col rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
              >
                <Icone className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                <span className="mt-2 text-sm font-medium text-foreground">{label}</span>
                <span className="mt-0.5 text-xs leading-snug text-muted-foreground">{texte}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default OtherServicesSection;
