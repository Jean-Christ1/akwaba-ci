import { useCallback, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

import { SOURCES, type DroitEffectif } from "./types";

/**
 * Les droits effectifs d'une personne, et d'où chacun lui vient.
 *
 * Savoir qu'une personne a un droit ne suffit pas : pour le lui retirer, il
 * faut savoir par où il lui arrive. Un droit qui vient d'un rôle se retire en
 * changeant le rôle, un droit nominatif en retirant l'exception, et un droit
 * qui vient de l'accès de secours ne se retire par aucun des deux.
 *
 * Sans cette colonne, retirer un droit se faisait à tâtons : on retirait le
 * rôle, la personne gardait le droit, et personne ne comprenait pourquoi.
 */
export function DroitsDUnePersonne({ mesDroits }: { mesDroits: string[] }) {
  const [identifiant, setIdentifiant] = useState("");
  const [cible, setCible] = useState<string | null>(null);
  const [lignes, setLignes] = useState<DroitEffectif[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const jePeuxAttribuer = mesDroits.includes("roles.attribuer");

  const charger = useCallback(async (userId: string) => {
    setChargement(true);
    const { data, error } = await supabase.rpc("permissions_effectives", { _user_id: userId });
    setChargement(false);
    if (error) {
      setErreur(error.message);
      setLignes([]);
      return;
    }
    setErreur(null);
    setLignes((data ?? []) as unknown as DroitEffectif[]);
  }, []);

  const chercher = () => {
    const id = identifiant.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      toast.error("Indiquez l'identifiant du compte, tel qu'il apparaît dans la recherche.");
      return;
    }
    setCible(id);
    void charger(id);
  };

  const retirer = async (code: string) => {
    if (!cible) return;
    const motif = window.prompt("Motif du retrait, conservé dans le journal :", "");
    if (motif === null) return;
    const { error } = await supabase.rpc("staff_set_permission", {
      p_user_id: cible,
      p_code: code,
      p_accorde: false,
      p_motif: motif,
      p_jours: null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Droit retiré pour cette personne.");
    void charger(cible);
  };

  const accordes = lignes.filter((l) => l.accordee);
  const secours = lignes.filter((l) => l.source === "secours").length;

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Les droits réellement détenus par une personne, avec la source de chacun. C'est la
        source qui dit comment le retirer.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <Label className="text-xs" htmlFor="cible">
            Identifiant du compte
          </Label>
          <Input
            id="cible"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="w-[22rem] max-w-full font-mono text-xs"
          />
        </div>
        <Button variant="outline" onClick={chercher} disabled={chargement}>
          {chargement ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
          ) : (
            <Search className="mr-1 h-3 w-3" aria-hidden="true" />
          )}
          Voir ses droits
        </Button>
      </div>

      {erreur && (
        <p className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {erreur}
        </p>
      )}

      {cible && !erreur && lignes.length > 0 && (
        <>
          <p className="text-sm">
            <strong>{accordes.length}</strong> droit{accordes.length > 1 ? "s" : ""} sur{" "}
            {lignes.length}
            {secours > 0 && (
              <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                dont {secours} par l'accès de secours
              </span>
            )}
          </p>

          {secours > 0 && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
              Cette personne tient des droits d'un rôle hérité qui ne figure pas dans la
              matrice. Ni le retrait d'un rôle ni une exception nominative ne les lui
              enlèveront : il faut retirer le rôle hérité, et lui donner d'abord un rôle de
              la matrice pour ne pas lui fermer la console d'un coup.
            </p>
          )}

          <ul className="space-y-1.5">
            {lignes.map((l) => {
              const source = SOURCES[l.source] ?? SOURCES.aucune;
              return (
                <li
                  key={l.code}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                    l.accordee ? "border-border" : "border-border/50 opacity-60"
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm">
                      {l.libelle}
                      {l.sensible && (
                        <span
                          className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle"
                          title="Droit sensible"
                          aria-label="Droit sensible"
                        />
                      )}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.categorie}
                      {l.detail && ` · ${l.detail}`}
                      {l.perimetre !== "partout" && ` · ${l.perimetre}`}
                      {l.expire_le &&
                        ` · jusqu'au ${new Date(l.expire_le).toLocaleDateString("fr-FR")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${source.ton}`}
                      title={source.explication}
                    >
                      {source.libelle}
                    </span>
                    {jePeuxAttribuer && l.accordee && l.source !== "retrait" && (
                      <Button size="sm" variant="outline" onClick={() => void retirer(l.code)}>
                        Retirer
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

export default DroitsDUnePersonne;
