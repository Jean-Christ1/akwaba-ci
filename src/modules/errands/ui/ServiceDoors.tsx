import { Link } from "react-router-dom";
import { ArrowRight, Bike, ShoppingBasket } from "lucide-react";

import { formatFcfa } from "@/modules/errands/domain";
import { MIN_PAYOUT } from "@/modules/errands/pricing";

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
 * Chaque preuve listée renvoie à un mécanisme réellement implanté : le devis
 * affiché avant publication, les canaux ouverts sur la fiche de course, le code
 * de remise que seul le client révèle, la vérification d'identité avant la
 * première mission, l'offre libre du shopper et le seuil de retrait.
 */
const PREUVES_CLIENT = [
  "Frais de service annoncés avant de commander",
  "Suivi par chat, appel et WhatsApp jusqu'à la remise",
  "Code de remise à 4 chiffres : vous seul clôturez la course",
];

const PREUVES_SHOPPER = [
  "Candidature en ligne, identité vérifiée par Akwaba",
  "Vous choisissez vos missions, votre prix et votre délai",
  `Retrait dès ${formatFcfa(MIN_PAYOUT)} vers Wave, Orange Money, MTN MoMo ou Moov`,
];

export function ServiceDoors() {
  return (
    <section aria-labelledby="akw-portes-titre" className="mt-8">
      <h2 id="akw-portes-titre" className="font-display text-xl font-semibold text-foreground">
        Les deux portes du service
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
        Vous avez besoin qu'on fasse une course pour vous, ou vous voulez en faire pour les autres.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Porte principale : surface pleine, la seule de la page à porter la
            couleur de marque en aplat. */}
        <article className="flex flex-col rounded-3xl bg-primary p-6 text-primary-foreground shadow-elevation-2 sm:p-8">
          <ShoppingBasket className="h-7 w-7" aria-hidden="true" />
          <h3 className="mt-4 font-display text-2xl font-semibold leading-tight text-balance">
            Demander une course
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-primary-foreground/85 text-pretty">
            Un shopper vérifié va au marché, au supermarché, à la pharmacie ou à la mairie pour
            vous. Vous décrivez ce qu'il vous faut, il achète, vous suivez en direct.
          </p>
          <ul className="mt-5 space-y-2 text-sm text-primary-foreground/90">
            {PREUVES_CLIENT.map((preuve) => (
              <li key={preuve} className="flex gap-2">
                <span aria-hidden="true">·</span>
                <span className="text-pretty">{preuve}</span>
              </li>
            ))}
          </ul>
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
            {PREUVES_SHOPPER.map((preuve) => (
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
