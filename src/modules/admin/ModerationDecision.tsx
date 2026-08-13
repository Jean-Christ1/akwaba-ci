import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import type { Decision } from "./ModerationQueue";
import type { ModerationEventRow, PlaceRow } from "./types";

interface ModerationDecisionDialogProps {
  target: { place: PlaceRow; action: Decision } | null;
  note: string;
  onNoteChange: (note: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Confirmation d'une décision de modération.
 *
 * Un refus sans motif laisse le partenaire sans rien à corriger : la note est
 * donc obligatoire dans ce sens, et facultative dans l'autre.
 */
export function ModerationDecisionDialog({
  target,
  note,
  onNoteChange,
  busy,
  onCancel,
  onConfirm,
}: ModerationDecisionDialogProps) {
  const refus = target?.action === "rejected";

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{refus ? "Refuser la fiche" : "Valider la fiche"}</DialogTitle>
          <DialogDescription>
            {target?.place?.name} - un email sera envoyé au partenaire avec le lien vers son profil.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Note pour le partenaire {refus && <span className="text-destructive">*</span>}
          </p>
          <Textarea
            rows={5}
            value={note}
            onChange={(e) => onNoteChange(e.target.value)}
            placeholder={
              refus ? "Expliquez ce qui doit être ajusté…" : "Bienvenue sur Akwaba…"
            }
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Annuler
          </Button>
          <Button
            disabled={busy || (refus && !note.trim())}
            onClick={onConfirm}
            variant={refus ? "destructive" : "default"}
          >
            {busy ? "Envoi…" : refus ? "Refuser et notifier" : "Publier et notifier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ModerationHistorySheetProps {
  place: PlaceRow | null;
  events: ModerationEventRow[];
  onClose: () => void;
}

/** Décisions déjà prises sur une fiche, motifs compris. */
export function ModerationHistorySheet({ place, events, onClose }: ModerationHistorySheetProps) {
  return (
    <Sheet open={!!place} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {place && (
          <>
            <SheetHeader>
              <SheetTitle>Historique - {place.name}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-3">
              {events.length === 0 && (
                <p className="text-sm text-muted-foreground">Aucun événement.</p>
              )}
              {events.map((h) => (
                <Card key={h.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <Badge
                      variant={
                        h.action === "approved"
                          ? "default"
                          : h.action === "rejected"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {h.action}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(h.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>
                  {h.note && <p className="mt-2 whitespace-pre-wrap text-sm">{h.note}</p>}
                </Card>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
