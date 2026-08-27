import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { NotificationHealthCard } from "@/modules/admin/NotificationHealthCard";
import { formatFcfa } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Indicateurs {
  courses_total: number;
  courses_completed: number;
  courses_cancelled: number;
  courses_disputed: number;
  courses_open: number;
  volume_achats: number;
  volume_service: number;
  commission_encaissee: number;
  supplements: number;
  duree_moyenne_min: number | null;
  ecart_temps_moyen: number | null;
  ecart_distance_moyen: number | null;
  shoppers_actifs: number;
  shoppers_en_attente: number;
  retraits_en_attente: number;
  montant_a_verser: number;
}

interface Performance {
  id: string;
  title: string;
  city: string;
  status: string;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  overtime_minutes: number | null;
  estimated_distance_km: number | null;
  actual_distance_km: number | null;
  overrun_fee: number | null;
  time_variance_pct: number | null;
  distance_variance_pct: number | null;
}

const PERIODES = [7, 30, 90];

/**
 * Tableau de bord d'exploitation.
 *
 * Ce que l'éditeur doit voir chaque matin : le volume, l'argent encaissé, la
 * santé du service, et surtout l'écart entre ce qui a été estimé et ce qui
 * s'est réellement passé. Une estimation qui dérape systématiquement se voit
 * ici avant de se traduire en litiges.
 */
export default function OperationsPage() {
  usePageTitle("Pilotage", "Activité, encaissements et écarts entre estimé et réalisé.");

  const { peut, loading } = useAuth();
  const isModerator = peut("exploitation.sante");
  const isAdmin = isModerator;
  const [jours, setJours] = useState(30);
  const [kpi, setKpi] = useState<Indicateurs | null>(null);
  const [derives, setDerives] = useState<Performance[]>([]);
  const [chargement, setChargement] = useState(true);

  const load = useCallback(async () => {
    setChargement(true);

    const { data, error } = await supabase.rpc("admin_dashboard", { p_days: jours });
    if (error) {
      toast.error("Chargement des indicateurs impossible.");
      setChargement(false);
      return;
    }
    const ligne = Array.isArray(data) ? data[0] : data;
    setKpi((ligne ?? null) as Indicateurs | null);

    // Les courses dont l'estimation s'est le plus écartée du réel.
    const { data: perf } = await supabase
      .from("errand_performance")
      .select(
        "id,title,city,status,estimated_minutes,actual_minutes,overtime_minutes,estimated_distance_km,actual_distance_km,overrun_fee,time_variance_pct,distance_variance_pct"
      )
      .not("actual_minutes", "is", null)
      .order("created_at", { ascending: false })
      .limit(40);

    setDerives(
      ((perf ?? []) as Performance[])
        .filter((p) => Math.abs(p.time_variance_pct ?? 0) > 25 || (p.overrun_fee ?? 0) > 0)
        .slice(0, 12)
    );
    setChargement(false);
  }, [jours]);

  useEffect(() => {
    if (isModerator || isAdmin) load();
  }, [isModerator, isAdmin, load]);

  if (loading) return null;

  if (!isModerator && !isAdmin) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé à l'équipe.{" "}
        <Link className="text-primary" to="/profil">
          Mon profil
        </Link>
      </div>
    );
  }

  const Carte = ({
    libelle,
    valeur,
    aide,
    ton,
  }: {
    libelle: string;
    valeur: string;
    aide?: string;
    ton?: "alerte";
  }) => (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{libelle}</p>
      <p
        className={`mt-1 font-display text-xl font-semibold ${
          ton === "alerte" ? "text-destructive" : ""
        }`}
      >
        {valeur}
      </p>
      {aide && <p className="mt-0.5 text-[11px] text-muted-foreground">{aide}</p>}
    </div>
  );

  return (
    <div className="akw-container max-w-5xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Pilotage</h1>

      <div className="mt-3 flex gap-2">
        {PERIODES.map((p) => (
          <Button
            key={p}
            size="sm"
            variant={jours === p ? "default" : "outline"}
            onClick={() => setJours(p)}
          >
            {p} jours
          </Button>
        ))}
      </div>

      {chargement ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement des indicateurs...</p>
      ) : !kpi ? (
        <p className="mt-6 text-sm text-muted-foreground">Aucune donnée sur la période.</p>
      ) : (
        <>
          <h2 className="mt-6 font-display text-lg font-semibold">Activité</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Carte libelle="Courses" valeur={String(kpi.courses_total)} />
            <Carte libelle="Terminées" valeur={String(kpi.courses_completed)} />
            <Carte libelle="Annulées" valeur={String(kpi.courses_cancelled)} />
            <Carte
              libelle="En litige"
              valeur={String(kpi.courses_disputed)}
              ton={kpi.courses_disputed > 0 ? "alerte" : undefined}
            />
          </div>

          <h2 className="mt-6 font-display text-lg font-semibold">Argent</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {/* Aucun agrégateur de paiement n'est branché : le client règle le
                shopper directement. Cette somme est donc due à la plateforme,
                elle n'a pas été reçue. L'appeler « encaissée » ferait lire un
                revenu là où il n'y a qu'une créance. */}
            <Carte
              libelle="Commission due"
              valeur={formatFcfa(kpi.commission_encaissee)}
              aide="Sur les courses terminées, non encaissée : aucun paiement ne transite par la plateforme"
            />
            <Carte libelle="Frais de service" valeur={formatFcfa(kpi.volume_service)} />
            <Carte
              libelle="Suppléments"
              valeur={formatFcfa(kpi.supplements)}
              aide="Dépassements facturés"
            />
            <Carte
              libelle="Volume d'achats"
              valeur={formatFcfa(kpi.volume_achats)}
              aide="Argent des marchands, non commissionné"
            />
          </div>

          <h2 className="mt-6 font-display text-lg font-semibold">Justesse des estimations</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-3">
            <Carte
              libelle="Durée moyenne réelle"
              valeur={kpi.duree_moyenne_min ? `${kpi.duree_moyenne_min} min` : "n. d."}
            />
            <Carte
              libelle="Écart de temps moyen"
              valeur={
                kpi.ecart_temps_moyen != null ? `${kpi.ecart_temps_moyen > 0 ? "+" : ""}${kpi.ecart_temps_moyen} %` : "n. d."
              }
              aide="Réalisé contre estimé"
              ton={(kpi.ecart_temps_moyen ?? 0) > 30 ? "alerte" : undefined}
            />
            <Carte
              libelle="Écart de distance moyen"
              valeur={
                kpi.ecart_distance_moyen != null
                  ? `${kpi.ecart_distance_moyen > 0 ? "+" : ""}${kpi.ecart_distance_moyen} %`
                  : "n. d."
              }
              aide="Réalisé contre estimé"
              ton={(kpi.ecart_distance_moyen ?? 0) > 30 ? "alerte" : undefined}
            />
          </div>

          <h2 className="mt-6 font-display text-lg font-semibold">Réseau et trésorerie</h2>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Carte libelle="Shoppers actifs" valeur={String(kpi.shoppers_actifs)} />
            <Carte
              libelle="Candidatures en attente"
              valeur={String(kpi.shoppers_en_attente)}
              ton={kpi.shoppers_en_attente > 0 ? "alerte" : undefined}
            />
            <Carte libelle="Retraits à traiter" valeur={String(kpi.retraits_en_attente)} />
            <Carte libelle="Montant à verser" valeur={formatFcfa(kpi.montant_a_verser)} />
          </div>

          <NotificationHealthCard />

          {derives.length > 0 && (
            <>
              <h2 className="mt-6 font-display text-lg font-semibold">
                Courses qui ont dérapé
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Écart de plus de 25 pour cent, ou supplément facturé. Une dérive répétée sur une
                zone signale une estimation à revoir.
              </p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2">Course</th>
                      <th className="py-2">Ville</th>
                      <th className="py-2">Temps</th>
                      <th className="py-2">Distance</th>
                      <th className="py-2">Supplément</th>
                    </tr>
                  </thead>
                  <tbody>
                    {derives.map((d) => (
                      <tr key={d.id} className="border-b border-border/60">
                        <td className="py-2">
                          <Link className="text-primary" to={`/courses/${d.id}`}>
                            {d.title}
                          </Link>
                        </td>
                        <td className="py-2 text-muted-foreground">{d.city}</td>
                        <td className="py-2">
                          {d.actual_minutes ?? "n. d."} / {d.estimated_minutes ?? "n. d."} min
                          {d.time_variance_pct != null && (
                            <span
                              className={
                                d.time_variance_pct > 0 ? "ml-1 text-accent" : "ml-1 text-muted-foreground"
                              }
                            >
                              ({d.time_variance_pct > 0 ? "+" : ""}
                              {d.time_variance_pct} %)
                            </span>
                          )}
                        </td>
                        <td className="py-2">
                          {(d.actual_distance_km ?? 0).toFixed(1)} /{" "}
                          {(d.estimated_distance_km ?? 0).toFixed(1)} km
                        </td>
                        <td className="py-2">{formatFcfa(d.overrun_fee ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
