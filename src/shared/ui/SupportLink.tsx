/**
 * Lien de contact du support.
 *
 * Le produit n'a aujourd'hui aucun canal par lequel un utilisateur puisse
 * signaler un problème. L'adresse à publier n'est pas une donnée technique :
 * elle appartient à l'éditeur, et l'inventer reviendrait à publier une boîte
 * qui n'existe pas.
 *
 * Ce composant prépare donc le canal sans le décider : il lit la configuration,
 * et n'affiche rien tant qu'elle est absente. Un lien de contact mort est pire
 * que pas de lien du tout, parce qu'il promet une réponse.
 *
 * Configuration, dans l'environnement de construction :
 *   VITE_SUPPORT_EMAIL   adresse de courriel du support
 *   VITE_SUPPORT_URL     page ou formulaire de contact, en https
 *
 * Les deux peuvent coexister ; le courriel est retenu en premier, car lui seul
 * permet de préremplir la référence d'incident.
 */
import type { ReactNode } from "react";

interface CanalSupport {
  href: string;
  /** Libellé par défaut, quand l'appelant n'en fournit pas. */
  libelle: string;
}

interface Props {
  /** Référence d'incident à transmettre au support, si elle existe. */
  reference?: string;
  className?: string;
  children?: ReactNode;
}

const MOTIF_COURRIEL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Résout le canal de contact configuré, ou `null` s'il n'y en a aucun. */
function canalSupport(reference?: string): CanalSupport | null {
  const courriel = valeurConfiguree(import.meta.env.VITE_SUPPORT_EMAIL);
  const adresse = valeurConfiguree(import.meta.env.VITE_SUPPORT_URL);

  if (courriel && MOTIF_COURRIEL.test(courriel)) {
    const sujet = reference
      ? `Akwaba, incident ${reference}`
      : "Akwaba, signalement d'un problème";
    return {
      href: `mailto:${courriel}?subject=${encodeURIComponent(sujet)}`,
      libelle: "Écrire au support",
    };
  }

  // Seul le protocole https est accepté : une valeur de configuration mal
  // renseignée ne doit pas pouvoir devenir un javascript: cliquable.
  if (adresse && adresse.startsWith("https://")) {
    return { href: adresse, libelle: "Contacter le support" };
  }

  return null;
}

/** Lien vers le support, ou rien du tout si aucun canal n'est configuré. */
export function SupportLink({ reference, className, children }: Props) {
  const canal = canalSupport(reference);
  if (!canal) return null;

  return (
    <a className={className} href={canal.href}>
      {children ?? canal.libelle}
    </a>
  );
}

function valeurConfiguree(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  const nettoyee = brut.trim();
  return nettoyee.length > 0 ? nettoyee : null;
}

export default SupportLink;
