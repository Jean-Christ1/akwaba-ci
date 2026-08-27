import { Link } from "react-router-dom";
import { ArrowRight, Bike, ShoppingBasket } from "lucide-react";

import { useCommissionRule } from "@/modules/errands/application/useCommissionRule";
import { formatFcfa } from "@/modules/errands/domain";

/**
 * Les deux portes d'entrée du service Shopper.
 *
 * Demander une course et devenir shopper ne sont pas deux boutons équivalents :
 * l'un est l'usage du service, l'autre l'engagement à le rendre. Les traiter à
 * l'identique laissait le visiteur arbitrer lui-même, ce qui coûte une seconde
 * d'hésitation à chaque visite. Deux surfaces distinctes, lagune pour l'action
 * principale et sable pour l'autre, portent donc la hiérarchie sans que la
 * seconde paraisse reléguée.
 */

/**
 * Les preuves du client ne figurent plus ici : l'accueil les porte deja, mot
 * pour mot, et les repeter donnait au visiteur l'impression de tourner en rond
 * entre deux ecrans qui racontaient la meme chose.
 *
 * Celles du shopper restent : elles n'existent nulle part ailleurs, et un
 * candidat a besoin de savoir ce qui l'attend avant de deposer un dossier.
 * Chacune renvoie a un mecanisme reellement implante : la verification
 * d'identite avant la premiere mission, l'offre libre, et le seuil de retrait.
 */

/** Le seuil de retrait dépend du barème en vigueur, il est donc calculé au
    rendu et non figé dans une constante de module. */
const preuvesShopper = (seuilRetrait: number) => [
  "Candidature en ligne, identité vérifiée par Akwaba",
  "Vous choisissez vos missions, votre prix et votre délai",
  `Retrait dès ${formatFcfa(seuilRetrait)} vers Wave, Orange Money, MTN MoMo ou Moov`,
];

export function ServiceDoors() {
  const { rule } = useCommissionRule();
  const preuvesDuShopper = preuvesShopper(rule.minPayout);

  return (
    <section aria-labelledby="akw-portes-titre" className="mt-8">
      <h2 id="akw-portes-titre" className="font-display text-xl font-semibold text-foreground">
        Par où vous voulez commencer
      </h2>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Porte principale : surface pleine, la seule de la page à porter la
            couleur de marque en aplat. */}
        <article className="flex flex-col rounded-3xl bg-primary p-6 text-primary-foreground shadow-elevation-2 sm:p-8">
          <ShoppingBasket className="h-7 w-7" aria-hidden="true" />
          <h3 className="mt-4 font-display text-2xl font-semibold leading-tight text-balance">
            Demander une course
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/85 text-pretty">
            Choisissez une catégorie ci-dessus, ou partez d'une page blanche.
          </p>
          <Link
            to="/courses/nouvelle"
            className="mt-6 inline-flex min-h-[48px] items-center justify-center gap-2 self-start rounded-full bg-background px-7 text-sm font-semibold text-foreground transition-transform hover:-translate-y-0.5"
          >
            Demander une course
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </article>

        {/* Porte secondaire : même soin, autre matière. Le sable chaud la
            distingue de l'action principale sans la faire passer pour un lien
            de bas de page. */}
        <article className="flex flex-col rounded-3xl border border-border bg-secondary p-6 text-secondary-foreground shadow-elevation-1 sm:p-8">
          <div className="flex items-center gap-3">
            <Bike className="h-7 w-7 text-primary" aria-hidden="true" />
            <span className="rounded-full bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-foreground">
              Revenu complémentaire
            </span>
          </div>
          <h3 className="mt-4 font-display text-2xl font-semibold leading-tight text-balance">
            Devenir shopper
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground text-pretty">
            Gagnez un revenu en réalisant des courses près de chez vous. Les missions ouvertes de
            votre quartier arrivent dans votre espace, vous répondez à celles qui vous vont.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-secondary-foreground">
            {preuvesDuShopper.map((preuve) => (
              <li key={preuve} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span className="text-pretty">{preuve}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            {/* La candidature, et non l'espace missions : ce dernier exige un
                profil validé et renverrait un visiteur sur un mur. */}
            <Link
              to="/courses/devenir-shopper"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-foreground/25 bg-background px-7 text-sm font-semibold text-foreground transition-colors hover:border-primary"
            >
              Devenir shopper
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              to="/courses/shopper"
              className="inline-flex min-h-[44px] items-center px-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Déjà shopper : mon espace missions
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}

export default ServiceDoors;
