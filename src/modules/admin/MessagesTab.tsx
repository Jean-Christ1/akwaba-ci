import { Card } from "@/components/ui/card";
import type { LeadRow } from "./types";

/**
 * Ce qui a été répondu aux visiteurs.
 *
 * Ce fil rassemblait les notes internes du partenaire. Il rassemble désormais
 * les réponses effectivement envoyées, ce qui est à la fois plus utile et plus
 * juste : la note interne ne quitte pas l'établissement, et retrouver « ce qui
 * a déjà été dit au client » veut dire retrouver ce qu'il a lu.
 *
 * La note interne se relit dans le tiroir de chaque demande.
 */
export function MessagesTab({ leads }: { leads: LeadRow[] }) {
  const repondues = leads.filter((l) => l.partner_reply);

  if (repondues.length === 0) {
    return (
      <p className="py-8 text-center text-muted-foreground">
        Aucune réponse envoyée pour le moment.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {repondues.map((l) => (
        <Card key={l.id} className="p-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>
              {l.full_name} · {l.places?.name}
            </span>
            <span>
              {new Date(l.replied_at ?? l.updated_at).toLocaleDateString("fr-FR")}
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{l.partner_reply}</p>
        </Card>
      ))}
    </div>
  );
}

export default MessagesTab;
