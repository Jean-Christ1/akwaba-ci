import { Ban, Check, MapPin, ShieldAlert } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import type { Droit, Role } from "./types";

interface Proprietes {
  droit: Droit | null;
  roles: Role[];
  onFermer: () => void;
}

/**
 * Ce qu'un droit permet, et ce qu'il ne permet pas.
 *
 * La description d'un droit dit ce qu'il ouvre. Elle ne disait jamais où il
 * s'arrête, et c'est pourtant la question de celui qui l'accorde : « ouvrir les
 * pièces d'identité » autorise-t-il à les télécharger ? À les transmettre ?
 *
 * Ce panneau met les deux phrases côte à côte, et nomme les rôles qui portent
 * le droit. Il ne modifie rien : on accorde ailleurs, en connaissance de cause.
 */
export function DroitDetail({ droit, roles, onFermer }: Proprietes) {
  const porteurs = droit ? roles.filter((r) => droit.roles.includes(r.code)) : [];

  return (
    <Sheet open={!!droit} onOpenChange={(o) => !o && onFermer()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {droit && (
          <>
            <SheetHeader>
              <SheetTitle className="flex items-start gap-2 text-left">
                {droit.libelle}
                {droit.sensible && (
                  <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    <ShieldAlert className="h-3 w-3" aria-hidden="true" />
                    sensible
                  </span>
                )}
              </SheetTitle>
            </SheetHeader>

            <p className="mt-1 font-mono text-[11px] text-muted-foreground">{droit.code}</p>

            <div className="mt-4 space-y-4 text-sm">
              <div className="rounded-xl border border-primary/30 bg-primary-soft p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Ce que ce droit permet
                </p>
                <p className="mt-1 text-[13px]">{droit.description ?? "Non documenté."}</p>
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  Ce qu'il ne permet pas
                </p>
                <p className="mt-1 text-[13px]">
                  {droit.ne_permet_pas ??
                    "Non documenté. Un droit dont on ignore les limites s'accorde à l'aveugle."}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">Portée</p>
                <p className="mt-1 flex items-center gap-1.5 text-[13px]">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  {droit.portee === "ville"
                    ? "Restreignable à une ou plusieurs villes, en attribuant le rôle sur une ville."
                    : "Vaut partout. Ce droit ne se restreint pas par ville."}
                </p>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  Rôles qui le portent ({porteurs.length})
                </p>
                {porteurs.length === 0 ? (
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    Aucun rôle ne le porte. Il ne s'obtient que par exception nominative.
                  </p>
                ) : (
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {porteurs.map((r) => (
                      <li
                        key={r.code}
                        className="rounded-full border border-border px-2.5 py-1 text-[11px]"
                        title={r.description ?? undefined}
                      >
                        {r.libelle}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {droit.sensible && (
                <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                  Droit sensible : chaque attribution demande un motif écrit et laisse une
                  trace nominative. Accordez-le pour une durée limitée quand c'est possible.
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default DroitDetail;
