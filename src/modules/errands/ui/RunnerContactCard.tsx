import { MessageCircle, Phone, Video } from "lucide-react";

import { Button } from "@/components/ui/button";
import { waLink } from "@/modules/errands/domain";
import type { RunnerCard } from "@/modules/errands/application/useErrandDetail";

interface RunnerContactCardProps {
  runner: RunnerCard;
  /** Rappelé dans le message WhatsApp pour situer la conversation. */
  errandTitle: string;
  videoUrl: string;
}

/**
 * Moyens de joindre le shopper assigné.
 *
 * Les coordonnées ne sont chargées que pour le shopper effectivement affecté à
 * la course. Quand l'une d'elles manque, le bouton correspondant n'est pas
 * rendu comme un lien : l'attribut disabled n'a aucun effet sur une ancre, si
 * bien qu'un bouton « désactivé » ouvrait tout de même un onglet vide.
 */
export function RunnerContactCard({ runner, errandTitle, videoUrl }: RunnerContactCardProps) {
  const lienWhatsapp = waLink(
    runner.whatsapp ?? runner.phone,
    `Bonjour, à propos de la course "${errandTitle}"`
  );

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">Votre shopper</h2>
      <p className="mt-1 text-sm">{runner.full_name}</p>
      <p className="text-xs text-muted-foreground">
        {runner.vehicle} · ★ {runner.rating} · {runner.jobs_completed} missions
      </p>
      {/* Ces trois commandes servent pendant une mission en cours, souvent en
          marchant et d'une seule main. En size="sm" elles ne faisaient que
          36 px de haut, et ne portent aucun libellé visible : rien ne rattrapait
          un appui manqué. La grille à trois colonnes tient à 360 px de large. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {runner.phone ? (
          <Button asChild variant="outline" size="sm" className="min-h-[44px] w-full">
            <a href={`tel:${runner.phone}`} aria-label={`Appeler ${runner.full_name}`}>
              <Phone className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="min-h-[44px] w-full" disabled aria-label="Numéro de téléphone indisponible">
            <Phone className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        {lienWhatsapp ? (
          <Button asChild variant="outline" size="sm" className="min-h-[44px] w-full">
            <a
              href={lienWhatsapp}
              target="_blank"
              rel="noreferrer"
              aria-label={`Écrire à ${runner.full_name} sur WhatsApp`}
            >
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
            </a>
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="min-h-[44px] w-full" disabled aria-label="WhatsApp indisponible">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}

        <Button asChild variant="outline" size="sm" className="min-h-[44px] w-full">
          <a
            href={videoUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Ouvrir la visioconférence"
          >
            <Video className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">Appel · WhatsApp · Visio</p>
    </section>
  );
}

export default RunnerContactCard;
