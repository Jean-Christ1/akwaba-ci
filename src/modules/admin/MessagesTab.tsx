import { Card } from "@/components/ui/card";
import type { LeadRow } from "./types";

/**
 * Notes échangées sur les demandes.
 *
 * Ce fil n'est pas une messagerie : il rassemble les notes que le partenaire a
 * laissées sur ses demandes, pour retrouver ce qui a déjà été dit à un client
 * sans rouvrir chaque fiche.
 */
export function MessagesTab({ leads }: { leads: LeadRow[] }) {
  const avecNote = leads.filter((l) => l.partner_note);

  if (avecNote.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Aucun message.</p>;
  }

  return (
    <div className="space-y-3">
      {avecNote.map((l) => (
        <Card key={l.id} className="p-4">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>
              {l.full_name} · {l.places?.name}
            </span>
            <span>{new Date(l.updated_at).toLocaleDateString("fr-FR")}</span>
          </div>
          <p className="text-sm">{l.partner_note}</p>
        </Card>
      ))}
    </div>
  );
}

export default MessagesTab;
