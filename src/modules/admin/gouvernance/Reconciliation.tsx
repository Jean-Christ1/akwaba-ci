import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

import type { LigneReconciliation } from "./types";

/**
 * Là où ce qui prétend donner l'accès et ce qui l'applique ne disent pas la
 * même chose.
 *
 * La plateforme énonce que l'accès vient de la matrice : un rôle, des droits,
 * des exceptions nominatives. Ce qui s'applique part aussi d'un rôle hérité
 * posé sur le compte, qui ouvre les trente-quatre permissions sans figurer
 * nulle part. Rien ne comparait les deux, donc l'affirmation n'était pas
 * vérifiable.
 *
 * Cet écran les compare, et sépare surtout deux situations très différentes.
 * Un compte dont le rôle hérité est doublé par la matrice est alignable sans
 * rien perdre, puisque la matrice explique déjà ses droits. Un compte qui n'a
 * que le rôle hérité, lui, tient tout d'un accès de secours invisible : c'est
 * celui-là qu'il faut regarder, et le retirer sans le remplacer fermerait sa
 * porte d'un coup.
 *
 * Cet écran ne corrige rien tout seul. Il montre ce qui est à trancher.
 */
export function Reconciliation() {
  const [lignes, setLignes] = useState<LigneReconciliation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase.rpc("gouvernance_reconciliation");
    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setLignes((data ?? []) as unknown as LigneReconciliation[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (chargement) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </div>
    );
  }

  if (erreur) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        {erreur}
      </p>
    );
  }

  const aVerifier = lignes.filter((l) => l.gravite === "a_verifier");
  const conformes = lignes.filter((l) => l.gravite !== "a_verifier");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Comparaison entre le rôle hérité posé sur le compte et les rôles de la matrice. Le
          rôle hérité « admin » ouvre tous les droits sans y figurer : c'est un accès de
          secours légitime, mais qu'on ne voit nulle part ailleurs.
        </p>
        <Button size="sm" variant="outline" onClick={() => void charger()}>
          <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
          Recharger
        </Button>
      </div>

      {aVerifier.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Aucun compte ne contourne la matrice.
        </p>
      ) : (
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {aVerifier.length} compte{aVerifier.length > 1 ? "s" : ""} à vérifier
          </p>
          <ul className="mt-2 space-y-2">
            {aVerifier.map((l) => (
              <li
                key={l.user_id}
                className="rounded-xl border border-destructive/30 bg-destructive/5 p-3"
              >
                <p className="text-sm font-medium">{l.courriel}</p>
                <p className="mt-0.5 text-xs text-destructive">{l.ecart}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Rôle hérité : {l.role_herite} · Matrice : {l.roles_matrice}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Retirer un rôle hérité sans le remplacer par un rôle de la matrice ferme la
            console à cette personne d'un coup. Attribuez d'abord, retirez ensuite.
          </p>
        </div>
      )}

      {conformes.length > 0 && (
        <div>
          <p className="text-sm font-medium">
            {conformes.length} compte{conformes.length > 1 ? "s" : ""} conforme
            {conformes.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-2 space-y-1.5">
            {conformes.map((l) => (
              <li
                key={l.user_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <span className="text-sm">{l.courriel}</span>
                <span className="text-[11px] text-muted-foreground">{l.roles_matrice}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default Reconciliation;
