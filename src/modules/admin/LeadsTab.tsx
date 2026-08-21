import { useState } from "react";
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
 */
export function LeadsTab({ leads, onReload }: { leads: LeadRow[]; onReload: () => void }) {
  const [selection, setSelection] = useState<LeadRow | null>(null);
  const [note, setNote] = useState("");

  const changerStatut = async (id: string, statut: string) => {
    const { error } = await supabase
      .from("leads")
      .update({ status: statut as LeadStatus })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lead mis à jour");
    onReload();
  };

  const enregistrerNote = async () => {
    if (!selection) return;
    const { error } = await supabase
      .from("leads")
      .update({ partner_note: note })
      .eq("id", selection.id);
    if (error) return toast.error(error.message);
    toast.success("Note enregistrée");
    onReload();
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
                  setNote(l.partner_note ?? "");
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
                <div className="space-y-2 border-t pt-3">
                  <p className="font-medium">Note partenaire</p>
                  <Textarea rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                  <Button onClick={enregistrerNote} size="sm">
                    Enregistrer
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
