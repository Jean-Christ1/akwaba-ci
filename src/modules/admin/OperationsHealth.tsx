import { useCallback, useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Tache {
  tache: string;
  frequence: string;
  active: boolean;
  dernier_debut: string | null;
  dernier_statut: string | null;
  dernier_message: string | null;
}

interface File {
  etat: string;
  nombre: number;
  plus_ancienne: string | null;
  abandonnees: number;
}

/** Au delà, un message en attente cesse d'accompagner l'évènement qu'il annonce. */
const RETARD_MINUTES = 30;

/**
 * Rend lisible ce qui, sinon, ne se voit pas.
 *
 * Deux mécanismes tournent sans que personne ne les regarde : l'ordonnanceur
 * des courses programmées et la file des notifications. Quand l'un s'arrête, il
 * ne produit aucune erreur, seulement une absence. Le client attend une course
 * qui ne repart pas, ou un message qui n'arrive jamais, et l'exploitant
 * l'apprend par une réclamation.
 *
 * La fonction de suivi et la vue de santé existaient déjà en base et n'étaient
 * appelées par aucun écran.
 */
export function OperationsHealth() {
  const [taches, setTaches] = useState<Tache[]>([]);
  const [file, setFile] = useState<File[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const [{ data: t, error: et }, { data: f, error: ef }] = await Promise.all([
      supabase.rpc("taches_planifiees"),
      supabase.from("notification_health").select("etat,nombre,plus_ancienne,abandonnees"),
    ]);

    const echec = et ?? ef;
    if (echec) {
      setErreur(echec.message);
      return;
    }
    setErreur(null);
    setTaches((t ?? []) as Tache[]);
    setFile((f ?? []) as File[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (erreur) {
    return (
      <section className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium text-destructive">La santé de l'exploitation n'a pas pu être lue.</p>
        <p className="mt-1 text-muted-foreground">{erreur}</p>
      </section>
    );
  }

  const enAttente = file.find((f) => f.etat === "pending");
  const echouees = file.reduce((somme, f) => somme + Number(f.abandonnees || 0), 0);
  const retard =
    enAttente?.plus_ancienne != null
      ? Math.round((Date.now() - new Date(enAttente.plus_ancienne).getTime()) / 60000)
      : 0;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Santé de l'exploitation</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Une tâche arrêtée ne produit aucune erreur, seulement une absence. C'est la première chose à
        regarder quand une course programmée ne repart pas, ou qu'une notification n'arrive jamais.
      </p>

      <h3 className="mt-3 text-sm font-semibold">Tâches planifiées</h3>
      {taches.length === 0 ? (
        <p className="mt-1 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Aucune tâche planifiée. Les courses programmées ne repartiront pas et la file de
          notifications ne se videra pas. Voir la section 10 de la documentation d'exploitation.
        </p>
      ) : (
        <ul className="mt-1 space-y-1.5">
          {taches.map((t) => {
            const enPanne = !t.active || t.dernier_statut === "failed";
            return (
              <li
                key={t.tache}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  {enPanne ? (
                    <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden="true" />
                  )}
                  <span className="font-medium">{t.tache}</span>
                  <span className="text-xs text-muted-foreground">{t.frequence}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {t.dernier_debut
                    ? `dernier passage ${new Date(t.dernier_debut).toLocaleString("fr-FR")} · ${
                        t.dernier_statut ?? "sans issue connue"
                      }`
                    : "jamais exécutée"}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <h3 className="mt-4 text-sm font-semibold">File des notifications</h3>
      <div className="mt-1 flex flex-wrap gap-2 text-sm">
        {file.length === 0 ? (
          <span className="rounded-xl border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
            Rien en file.
          </span>
        ) : (
          file.map((f) => (
            <span key={f.etat} className="rounded-xl border border-border px-3 py-2">
              {f.etat} : <strong>{f.nombre}</strong>
            </span>
          ))
        )}
      </div>
      {retard > RETARD_MINUTES && (
        <p className="mt-2 text-xs text-destructive">
          Le message le plus ancien attend depuis {retard} minutes. Un message d'accompagnement perd
          son sens s'il arrive après l'évènement qu'il annonce.
        </p>
      )}
      {echouees > 0 && (
        <p className="mt-1 text-xs text-destructive">
          {echouees} message{echouees > 1 ? "s" : ""} abandonné{echouees > 1 ? "s" : ""} après
          plusieurs tentatives.
        </p>
      )}
    </section>
  );
}

export default OperationsHealth;
