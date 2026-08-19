import { KeyRound, MessagesSquare, ReceiptText, Scale, ShieldCheck } from "lucide-react";

/**
 * Ce qui protège le client, énoncé en faits.
 *
 * Chaque ligne correspond à un mécanisme vérifiable dans le produit : la
 * validation du profil shopper et la note de fin de course, le code de remise
 * délivré au seul client par une fonction serveur, le reçu déposé dans un
 * espace privé, l'ouverture d'un litige qui gèle les gains jusqu'à l'arbitrage,
 * et les canaux de suivi ouverts sur la fiche de course. Aucune promesse
 * commerciale ne doit s'ajouter ici sans mécanisme derrière.
 */
const GARANTIES = [
  {
    icon: ShieldCheck,
    titre: "Shopper vérifié",
    texte: "Identité contrôlée par Akwaba avant la première mission, puis une note après chaque course.",
  },
  {
    icon: KeyRound,
    titre: "Code de remise",
    texte: "Un code à 4 chiffres que vous seul pouvez afficher. Sans lui, la course ne se clôture pas.",
  },
  {
    icon: ReceiptText,
    titre: "Preuve d'achat",
    texte: "Le reçu est photographié et déposé dans un espace privé, accessible aux seules parties de la course.",
  },
  {
    icon: Scale,
    titre: "Litige arbitré",
    texte: "En cas de désaccord, vous ouvrez un litige : les gains du shopper sont gelés jusqu'à la décision d'un modérateur.",
  },
  {
    icon: MessagesSquare,
    titre: "Suivi en direct",
    texte: "Chat, appel, WhatsApp et visio pendant la course, puis une facture détaillée à la fin.",
  },
];

export function ServiceProtection() {
  return (
    <section aria-labelledby="akw-protection-titre" className="mt-8">
      <h2 id="akw-protection-titre" className="font-display text-xl font-semibold text-foreground">
        Ce qui vous protège
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
        Confier une course à quelqu'un demande de la confiance. Voici ce qui la rend vérifiable.
      </p>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {GARANTIES.map(({ icon: Icone, titre, texte }) => (
          <li key={titre} className="rounded-2xl border border-border bg-muted/30 p-4">
            <Icone className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="mt-2 text-sm font-semibold text-foreground">{titre}</p>
            <p className="mt-0.5 text-sm text-muted-foreground text-pretty">{texte}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ServiceProtection;
