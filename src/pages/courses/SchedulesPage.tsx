import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Pause, Play } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

type Rythme = "weekly" | "biweekly" | "monthly";

interface Programmation {
  id: string;
  label: string;
  rhythm: Rythme;
  day_of_week: number | null;
  day_of_month: number | null;
  hour_of_day: number;
  is_active: boolean;
  next_run_at: string;
  last_run_at: string | null;
  runs_count: number;
  template_id: string | null;
}

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

/** Formulation en français naturel plutôt qu'un code que personne ne lit. */
const decrire = (p: Programmation): string => {
  const heure = `${String(p.hour_of_day).padStart(2, "0")} h`;
  if (p.rhythm === "monthly") return `Le ${p.day_of_month} de chaque mois, vers ${heure}`;
  const jour = JOURS[p.day_of_week ?? 0];
  return p.rhythm === "weekly"
    ? `Chaque ${jour}, vers ${heure}`
    : `Un ${jour} sur deux, vers ${heure}`;
};

/**
 * Les courses programmées du client.
 *
 * Une programmation court sans son auteur : elle doit donc pouvoir être vue,
 * suspendue et reprise à tout moment. Sans cet écran, elle continuerait de
 * republier des courses sans que personne ne puisse l'arrêter autrement qu'en
 * appelant le support.
 */
export default function SchedulesPage() {
  usePageTitle("Mes courses programmées", "Vos courses qui reviennent, sous votre contrôle.");
  const { user } = useAuth();

  const [lignes, setLignes] = useState<Programmation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    if (!user) {
      setChargement(false);
      return;
    }
    const { data, error } = await supabase
      .from("errand_schedules")
      .select("*")
      .order("next_run_at");

    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setLignes((data ?? []) as Programmation[]);
  }, [user]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const basculer = async (p: Programmation) => {
    setEnCours(p.id);
    const { error } = await supabase.rpc("errand_schedule_set_active", {
      p_schedule_id: p.id,
      p_active: !p.is_active,
    });
    setEnCours(null);

    if (error) return toast.error(error.message);
    toast.success(
      p.is_active
        ? "Programmation suspendue, plus aucune course ne partira."
        : "Programmation reprise, à partir de la prochaine échéance."
    );
    void charger();
  };

  if (!user) {
    return (
      <div className="akw-container max-w-xl py-12 text-center">
        <h1 className="font-display text-2xl font-semibold">Mes courses programmées</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connectez-vous pour retrouver vos courses qui reviennent.
        </p>
        <Button asChild className="mt-4 min-h-[44px]">
          <Link to="/auth?redirect=/courses/programmees">Se connecter</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="akw-container max-w-3xl py-6">
      <p className="akw-eyebrow">Akwaba Courses</p>
      <h1 className="font-display text-2xl font-semibold">Mes courses programmées</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Les courses qui reviennent, republiées automatiquement. Suspendez-les quand vous voulez.
      </p>

      {chargement ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>
      ) : erreur ? (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Vos programmations n'ont pas pu être chargées.</p>
          <p className="mt-1 text-muted-foreground">{erreur}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => void charger()}>
            Réessayer
          </Button>
        </div>
      ) : lignes.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-center">
          <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-medium">Aucune course programmée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Une course qui revient chaque semaine se programme depuis son détail, et se republie
            ensuite sans que vous ayez à y penser.
          </p>
          <Button asChild className="mt-4 min-h-[44px]">
            <Link to="/courses">Voir mes courses</Link>
          </Button>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {lignes.map((p) => (
            <li key={p.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{p.label}</p>
                    {!p.is_active && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        Suspendue
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{decrire(p)}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {p.is_active
                      ? `Prochaine le ${new Date(p.next_run_at).toLocaleDateString("fr-FR", {
                          weekday: "long",
                          day: "numeric",
                          month: "long",
                        })}`
                      : "Reprendra à la prochaine échéance après reprise"}
                    {p.runs_count > 0 && ` · ${p.runs_count} course${p.runs_count > 1 ? "s" : ""} déjà publiée${p.runs_count > 1 ? "s" : ""}`}
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  {p.template_id && (
                    <Button asChild size="sm" variant="outline" className="min-h-[44px]">
                      <Link to={`/courses/${p.template_id}`}>Le modèle</Link>
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant={p.is_active ? "outline" : "default"}
                    className="min-h-[44px]"
                    disabled={enCours === p.id}
                    onClick={() => void basculer(p)}
                  >
                    {p.is_active ? (
                      <>
                        <Pause className="h-4 w-4" aria-hidden="true" />
                        Suspendre
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" aria-hidden="true" />
                        Reprendre
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
