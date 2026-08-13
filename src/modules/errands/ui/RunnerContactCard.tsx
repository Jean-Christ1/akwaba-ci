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
 * la course : les boutons restent inactifs tant qu'elles manquent, plutôt que
 * d'ouvrir un lien vide.
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
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Button asChild variant="outline" size="sm" disabled={!runner.phone}>
          <a
            href={runner.phone ? `tel:${runner.phone}` : undefined}
            aria-label={`Appeler ${runner.full_name}`}
          >
            <Phone className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
        <Button asChild variant="outline" size="sm" disabled={!lienWhatsapp}>
          <a
            href={lienWhatsapp ?? "#"}
            target="_blank"
            rel="noreferrer"
            aria-label={`Écrire à ${runner.full_name} sur WhatsApp`}
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </a>
        </Button>
        <Button asChild variant="outline" size="sm">
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
