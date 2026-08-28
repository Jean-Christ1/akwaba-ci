import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface ALire {
  genre: string;
  user_id: string;
  courriel: string;
  intitule: string;
  code: string;
  sensible: boolean;
  motif: string | null;
  accorde_le: string;
  revu_le: string | null;
  jours_depuis: number;
  echeance: string | null;
}

/**
 * La revue des accès.
 *
 * Un droit s'accorde en trois secondes, pour une raison qui paraît évidente sur
 * le moment. Il se retire rarement, parce que rien ne le rappelle. Au bout d'un
 * an, personne ne sait plus qui détient quoi ni pourquoi.
 *
 * Ce qui manquait n'était pas un contrôle de plus mais une date : celle où
 * quelqu'un a relu l'accès et l'a confirmé. Sans elle, la question « est-ce
 * encore justifié ? » ne se pose jamais, faute d'endroit où la poser.
 *
 * Cet écran ne retire rien tout seul, et c'est délibéré. Fermer un accès
 * sensible parce que personne ne l'a relu couperait la console à quelqu'un au
 * pire moment, un dimanche, sans que personne comprenne pourquoi.
 */
export function RevueDesAcces() {
  const [lignes, setLignes] = useState<ALire[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase.rpc("acces_a_revoir", {
      p_jours_sensibles: 90,
      p_jours_courants: 365,
    });
    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setLignes((data ?? []) as unknown as ALire[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const confirmer = async (l: ALire) => {
    const clef = `${l.genre}-${l.user_id}-${l.code}`;
    setEnCours(clef);
    const { error } = await supabase.rpc("acces_confirmer_revue", {
      p_genre: l.genre,
      p_user_id: l.user_id,
      p_code: l.code,
    });
    setEnCours(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Accès relu et confirmé.");
    void charger();
  };

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

  const sensibles = lignes.filter((l) => l.sensible);
  const courants = lignes.filter((l) => !l.sensible);

  const rendre = (liste: ALire[]) => (
    <ul className="mt-2 space-y-2">
      {liste.map((l) => {
        const clef = `${l.genre}-${l.user_id}-${l.code}`;
        return (
          <li
            key={clef}
            className={`rounded-xl border p-3 ${
              l.sensible ? "border-destructive/30 bg-destructive/5" : "border-border"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {l.intitule}
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {l.genre === "role" ? "rôle" : "exception"}
                  </span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{l.courriel}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Accordé le {new Date(l.accorde_le).toLocaleDateString("fr-FR")} ·{" "}
                  {l.revu_le
                    ? `relu le ${new Date(l.revu_le).toLocaleDateString("fr-FR")}`
                    : "jamais relu"}{" "}
                  · {l.jours_depuis} jours
                  {l.motif && ` · ${l.motif}`}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={enCours === clef}
                onClick={() => void confirmer(l)}
              >
                {enCours === clef && (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                )}
                Toujours justifié
              </Button>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="max-w-2xl text-xs text-muted-foreground">
          Les accès sans échéance qu'aucun relecteur n'a confirmés depuis trois mois pour
          les droits sensibles, un an pour les autres. Un accès à terme n'y figure pas : il
          se referme de lui-même.
        </p>
        <Button size="sm" variant="outline" onClick={() => void charger()}>
          <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
          Recharger
        </Button>
      </div>

      {lignes.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-sm text-primary">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Tous les accès en cours ont été relus dans les délais.
        </p>
      ) : (
        <>
          {sensibles.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-destructive">
                <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
                Droits sensibles à relire ({sensibles.length})
              </h3>
              {rendre(sensibles)}
            </section>
          )}

          {courants.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold">
                Autres accès à relire ({courants.length})
              </h3>
              {rendre(courants)}
            </section>
          )}

          <p className="text-[11px] text-muted-foreground">
            Confirmer un accès dit « je l'ai regardé et il reste justifié ». Ce geste est
            tracé nominativement : dans un an, quelqu'un demandera qui l'a laissé ouvert.
            Vos propres accès sont relus par quelqu'un d'autre.
          </p>
        </>
      )}
    </div>
  );
}

export default RevueDesAcces;
