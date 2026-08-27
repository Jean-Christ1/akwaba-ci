import { Link } from "react-router-dom";
import { ArrowRight, Banknote, Wallet } from "lucide-react";

import { useCommissionRule } from "@/modules/errands/application/useCommissionRule";
import { PAY_METHODS, formatFcfa } from "@/modules/errands/domain";
import { usePricingGrid } from "@/modules/errands/application/usePricingGrid";

/**
 * Le prix, expliqué avant qu'on le demande.
 *
 * Le hub présentait le service sans jamais dire ce qu'il coûte, alors que
 * c'est la première question posée. Le minimum et le taux de commission
 * sont lus dans le barème en vigueur, celui-là même que le serveur applique
 * au devis : les recopier à la main ferait mentir la page dès qu'un
 * exploitant publie une nouvelle version. La durée comprise et le prix à la
 * minute viennent du moteur tarifaire, qui en est la seule source.
 */
export function ServicePriceExplainer() {
  const { rule } = useCommissionRule();
  // Les minutes offertes et le prix à la minute appartiennent au barème
  // tarifaire, pas au barème de commission : ils se lisent ailleurs.
  const { grille } = usePricingGrid();
  const tauxCommission = Math.round(rule.rate * 100);

  return (
    <section aria-labelledby="akw-prix-titre" className="mt-8">
      <h2 id="akw-prix-titre" className="font-display text-xl font-semibold text-foreground">
        Ce que vous payez, et à qui
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
        Deux enveloppes, jamais mélangées : l'argent de vos achats et les frais de service.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <article className="akw-card p-5">
          <Banknote className="h-6 w-6 text-primary" aria-hidden="true" />
          <h3 className="mt-3 font-display text-lg font-semibold">Le budget d'achat</h3>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            C'est le prix des articles. Il revient intégralement au marchand : Akwaba n'y touche
            pas et n'y prélève rien.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li className="text-pretty">
              Personne ne connaît le prix exact au marché avant d'y être : ce que vous saisissez est
              une estimation, pas un paiement.
            </li>
            <li className="text-pretty">
              Le shopper photographie le reçu et saisit le montant réel, puis on régularise au franc
              près, dans un sens comme dans l'autre.
            </li>
          </ul>
        </article>

        <article className="akw-card p-5">
          <Wallet className="h-6 w-6 text-primary" aria-hidden="true" />
          <h3 className="mt-3 font-display text-lg font-semibold">Les frais de service</h3>
          <p className="mt-1 text-sm text-muted-foreground text-pretty">
            C'est la seule somme calculée par Akwaba, et elle s'affiche pendant que vous décrivez la
            course, donc avant de commander.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <li className="text-pretty">
              Minimum {formatFcfa(rule.minServiceFee)}, selon le véhicule, la distance, le volume
              et l'urgence.
            </li>
            <li className="text-pretty">
              {grille
                ? `Les ${grille.freeMinutes} premières minutes sont comprises, puis ${grille.perMinute} FCFA la minute.`
                : "Le détail du temps s'affiche dès que le barème est chargé."}
            </li>
            <li className="text-pretty">
              La commission Akwaba de {tauxCommission} % est prélevée sur ces frais seulement. Le
              reste rémunère le shopper, et le pourboire lui revient en entier.
            </li>
          </ul>
        </article>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-foreground">Vous réglez comme vous en avez l'habitude</h3>
      <ul className="mt-3 flex flex-wrap gap-2">
        {PAY_METHODS.map((m) => (
          <li
            key={m.value}
            className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground"
          >
            <span aria-hidden="true">{m.emoji}</span>
            {m.label}
          </li>
        ))}
      </ul>

      <Link
        to="/courses/comment-ca-marche"
        className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Voir la grille tarifaire détaillée
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

export default ServicePriceExplainer;
