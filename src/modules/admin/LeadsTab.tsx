import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { Row, StatusBadge } from "./primitives";
import type { LeadRow, LeadStatus } from "./types";

/**
 * Demandes reçues sur les fiches.
 *
 * Le détail s'ouvre en tiroir plutôt qu'en page : le partenaire traite ses
 * demandes en série et perdrait sa place dans la liste à chaque aller-retour.
 *
 * Deux choses ont changé ici, et elles vont ensemble.
 *
 * L'écran n'écrit plus dans la table. Il passait par une modification directe,
 * que la base acceptait sur toutes les colonnes : un partenaire pouvait
 * réécrire le nom, le courriel et le message du visiteur, ou déplacer la
 * demande chez un confrère. L'écriture passe désormais par lead_traiter, qui
 * sait ce qu'elle a le droit de changer.
 *
 * Et le partenaire peut répondre. Marquer « recontacté » ne disait rien au
 * visiteur, qui attendait une réponse ne venant pas par le service. Ce qui est
 * écrit dans la réponse lui parvient ; la note reste interne.
 */
export function LeadsTab({ leads, onReload }: { leads: LeadRow[]; onReload: () => void }) {
  const [selection, setSelection] = useState<LeadRow | null>(null);
  const [note, setNote] = useState("");
  const [reponse, setReponse] = useState("");
  const [enCours, setEnCours] = useState(false);

  // La note interne n'est plus lisible dans la table : une politique de ligne
  // ne sait pas cacher une colonne, et le visiteur lit la même ligne. Elle
  // revient par une fonction qui vérifie que c'est bien notre établissement.
  useEffect(() => {
    if (!selection) return;
    let annule = false;
    setReponse("");
    supabase.rpc("lead_note_interne", { p_id: selection.id }).then(({ data }) => {
      if (!annule) setNote(typeof data === "string" ? data : "");
    });
    return () => {
      annule = true;
    };
  }, [selection]);

  const traiter = async (
    id: string,
    changement: { statut?: string; note?: string; reponse?: string }
  ) => {
    setEnCours(true);
    const { error } = await supabase.rpc("lead_traiter", {
      p_id: id,
      p_status: (changement.statut as LeadStatus) ?? null,
      p_note: changement.note ?? null,
      p_reponse: changement.reponse ?? null,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return false;
    }
    onReload();
    return true;
  };

  const changerStatut = async (id: string, statut: string) => {
    if (await traiter(id, { statut })) toast.success("Demande mise à jour.");
  };

  const enregistrerNote = async () => {
    if (!selection) return;
    if (await traiter(selection.id, { note })) toast.success("Note interne enregistrée.");
  };

  const envoyerReponse = async () => {
    if (!selection) return;
    if (reponse.trim().length < 5) {
      toast.error("Écrivez la réponse que le visiteur va lire.");
      return;
    }
    // Répondre vaut prise en charge : laisser la demande en « nouvelle » alors
    // qu'on vient d'y répondre ferait retraiter la même demande demain.
    if (await traiter(selection.id, { reponse, statut: "contacted" })) {
      toast.success("Réponse envoyée au visiteur.");
      setReponse("");
    }
  };

  return (
    <>
      <Card className="overflow-hidden p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Lieu</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leads.map((l) => (
              <TableRow
                key={l.id}
                className="cursor-pointer"
                onClick={() => {
                  setSelection(l);
                }}
              >
                <TableCell className="text-xs">
                  {new Date(l.created_at).toLocaleDateString("fr-FR")}
                </TableCell>
                <TableCell>{l.places?.name ?? "-"}</TableCell>
                <TableCell>
                  <div className="text-sm">{l.full_name}</div>
                  <div className="text-xs text-muted-foreground">{l.email}</div>
                </TableCell>
                <TableCell>{l.kind}</TableCell>
                <TableCell>
                  <StatusBadge status={l.status} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <select
                    value={l.status}
                    onChange={(e) => changerStatut(l.id, e.target.value)}
                    className="rounded border bg-background px-2 py-1 text-xs"
                    aria-label={`Statut de la demande de ${l.full_name}`}
                  >
                    <option value="new">Nouveau</option>
                    <option value="in_review">En cours</option>
                    <option value="contacted">Contacté</option>
                    <option value="closed">Clôturé</option>
                  </select>
                </TableCell>
              </TableRow>
            ))}
            {leads.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  Aucune demande.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <Sheet open={!!selection} onOpenChange={(o) => !o && setSelection(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selection && (
            <>
              <SheetHeader>
                <SheetTitle>Demande #{selection.id.slice(0, 8)}</SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Row k="Lieu" v={selection.places?.name ?? "-"} />
                <Row k="Contact" v={`${selection.full_name} · ${selection.email}`} />
                {selection.phone && <Row k="Téléphone" v={selection.phone} />}
                <Row k="Type" v={selection.kind} />
                {selection.party_size && <Row k="Personnes" v={selection.party_size} />}
                {selection.date_from && (
                  <Row k="Dates" v={`${selection.date_from} → ${selection.date_to ?? "?"}`} />
                )}
                {selection.budget && <Row k="Budget" v={selection.budget} />}
                <div>
                  <p className="text-muted-foreground">Message</p>
                  <p className="mt-1">{selection.message}</p>
                </div>
                {selection.partner_reply && (
                  <div className="rounded-xl border border-border bg-muted/40 p-3">
                    <p className="text-xs text-muted-foreground">Déjà répondu</p>
                    <p className="mt-1 whitespace-pre-wrap">{selection.partner_reply}</p>
                  </div>
                )}

                <div className="space-y-2 border-t pt-3">
                  <p className="font-medium">Répondre au visiteur</p>
                  <p className="text-xs text-muted-foreground">
                    Ce texte lui est envoyé et s'affiche dans son suivi de demande.
                  </p>
                  <Textarea
                    rows={4}
                    value={reponse}
                    onChange={(e) => setReponse(e.target.value)}
                    placeholder="Bonjour, il nous reste une chambre pour ces dates..."
                  />
                  <Button onClick={envoyerReponse} size="sm" disabled={enCours}>
                    Envoyer la réponse
                  </Button>
                </div>

                <div className="space-y-2 border-t pt-3">
                  <p className="font-medium">Note interne</p>
                  <p className="text-xs text-muted-foreground">
                    Pour votre équipe seulement. Le visiteur ne la voit jamais.
                  </p>
                  <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button onClick={enregistrerNote} size="sm" variant="outline" disabled={enCours}>
                    Enregistrer la note
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

export default LeadsTab;
