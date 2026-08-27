import { Link } from "react-router-dom";
import { ArrowRight, Bike, KeyRound, ReceiptText, ShieldCheck } from "lucide-react";

/**
 * Mise en avant du service Shopper sur l'accueil.
 *
 * Le Shopper est le produit principal : la découverte de lieux ne doit jamais
 * le précéder à l'écran. Ce bloc est donc autonome et se place immédiatement
 * sous le héros, avant toute section éditoriale.
 */

/**
 * Chaque promesse ci-dessous correspond à un mécanisme réellement implanté :
 * la validation du profil shopper avant sa première mission, le devis calculé
 * et affiché avant publication de la demande, et le code de remise que seul le
 * client peut révéler pour clôturer la course.
 */
const REASSURANCES = [
  {
    icon: ShieldCheck,
    titre: "Shopper validé",
    texte: "Chaque profil est contrôlé par Akwaba avant sa première mission.",
  },
  {
    icon: ReceiptText,
    titre: "Prix annoncé avant",
    texte: "Les frais de service s'affichent pendant que vous décrivez la course.",
  },
  {
    icon: KeyRound,
    titre: "Code de remise",
    texte: "Vous seul le communiquez : rien n'est clôturé sans votre accord.",
  },
];

export function ShopperSpotlight() {
  return (
    <section
      aria-labelledby="akw-shopper-titre"
      className="border-b border-border bg-primary-soft py-8 sm:py-12"
    >
      <div className="akw-container">
        <p className="akw-eyebrow text-primary">Akwaba Shopper · Notre service principal</p>
        <h2
          id="akw-shopper-titre"
          className="mt-2 max-w-3xl font-display text-2xl font-semibold leading-tight text-foreground text-balance sm:text-3xl"
        >
          Vos courses, vos démarches et votre quotidien, sans vous déplacer.
        </h2>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground text-pretty sm:text-base">
          Vous décrivez ce qu'il vous faut, un shopper s'en charge et vous suivez la course jusqu'à
          la remise. Supermarché, marché, pharmacie, démarches administratives : tout se demande
          depuis votre téléphone.
        </p>

        {/* Les deux portes du service, et elles seules. Le mode d'emploi n'est
            plus proposé ici : qui veut comprendre avant d'agir le trouve dans
            le pied de page et dans le hub, alors qu'affiché ici il retardait
            l'action au lieu de la servir.

            La porte principale garde la couleur de marque, pleine et surélevée.
            La seconde prend la teinte accent, donc une autre famille de
            couleur : la hiérarchie se lit au premier regard sans que devenir
            shopper ressemble à un lien de bas de bloc. Même hauteur pour les
            deux, celle du bouton du héros, sinon la même action prendrait
            deux tailles sur un même écran. */}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            to="/courses/nouvelle"
            className="group inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-elevation-2 transition-transform duration-200 hover:-translate-y-0.5"
          >
            Demander une course
            <ArrowRight
              className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <Link
            to="/courses/devenir-shopper"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-6 text-sm font-semibold text-foreground shadow-elevation-1 transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Bike className="h-4 w-4 text-accent" aria-hidden="true" />
            Devenir shopper
          </Link>
        </div>

        {/* Réassurance : trois faits vérifiables, pas des arguments. */}
        <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
          {REASSURANCES.map(({ icon: Icone, titre, texte }) => (
            <li
              key={titre}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-background px-4 py-3"
            >
              <Icone className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">{titre}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{texte}</p>
              </div>
            </li>
          ))}
        </ul>

      </div>

      {/* L'accueil dit pourquoi ; le hub dit quoi, combien et comment on est
          protege. Un lien qui promettait « tous les services » ouvrait sur ce
          que le visiteur venait de lire : il nomme desormais ce qu'il apporte
          de neuf, faute de quoi le clic ressemble a un retour en arriere. */}
      <div className="akw-container mt-6 text-center">
        <Link
          to="/services"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-primary hover:underline"
        >
          Voir le catalogue complet, les tarifs et les protections
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

    </section>
  );
}

export default ShopperSpotlight;
