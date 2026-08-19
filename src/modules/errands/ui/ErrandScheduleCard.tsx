import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export type ScheduleRhythm = "weekly" | "biweekly" | "monthly";

/**
 * Les jours de la semaine, dans l'ordre attendu par la base : dimanche vaut 0,
 * comme EXTRACT(DOW). Le vocabulaire est celui de la page des courses
 * programmées, qui décrit les mêmes rythmes. Deux formulations différentes
 * pour un même rythme feraient douter le client d'avoir programmé ce qu'il
 * croit ; la liste est recopiée plutôt que partagée parce que les deux écrans
 * ne partagent aujourd'hui aucun module commun.
 */
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const RYTHMES: { value: ScheduleRhythm; label: string }[] = [
  { value: "weekly", label: "Chaque semaine" },
  { value: "biweekly", label: "Une semaine sur deux" },
  { value: "monthly", label: "Chaque mois" },
];

/**
 * Le jour du mois s'arrête à 28, exactement comme la contrainte de la table :
 * un rendez-vous fixé au 31 sauterait les mois courts sans que personne ne
 * comprenne pourquoi sa course n'est pas partie.
 */
const JOURS_DU_MOIS = Array.from({ length: 28 }, (_, i) => i + 1);

const HEURES = Array.from({ length: 24 }, (_, i) => i);

/** Bornes du libellé, reprises de la contrainte errand_schedules_label_len. */
export const LIBELLE_MIN = 2;
export const LIBELLE_MAX = 80;

/**
 * Formulation en français naturel du rythme choisi, identique à celle de la
 * page des courses programmées : le client doit y relire la phrase qu'il a
 * validée ici.
 */
export function decrireRythme(
  rythme: ScheduleRhythm,
  jourSemaine: number,
  jourMois: number,
  heure: number
): string {
  const heureLue = `${String(heure).padStart(2, "0")} h`;
  if (rythme === "monthly") return `Le ${jourMois} de chaque mois, vers ${heureLue}`;
  const jour = JOURS[jourSemaine] ?? JOURS[0];
  return rythme === "weekly"
    ? `Chaque ${jour}, vers ${heureLue}`
    : `Un ${jour} sur deux, vers ${heureLue}`;
}

interface ProgrammationExistante {
  id: string;
  label: string;
  is_active: boolean;
  next_run_at: string;
}

interface ErrandScheduleCardProps {
  errandId: string;
  /** Titre de la course, proposé comme libellé de la programmation. */
  errandTitle: string;
  onCreated?: () => void;
}

const CHAMP_SELECT =
  "mt-1 h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary";

/**
 * Programmer une course, côté client.
 *
 * La fonction errand_schedule_create existait en base, ouverte au client, et
 * aucun écran ne l'appelait. La page des courses programmées annonçait
 * pourtant qu'une course qui revient chaque semaine se programme depuis son
 * détail : la fonctionnalité entière était inatteignable, et le client était
 * renvoyé vers un contrôle qui n'existait nulle part.
 *
 * La fonction serveur refuse toute course dont le demandeur n'est pas le
 * client (42501) : ce contrôle n'est donc offert qu'à lui.
 */
export function ErrandScheduleCard({ errandId, errandTitle, onCreated }: ErrandScheduleCardProps) {
  const maintenant = new Date();

  const [ouvert, setOuvert] = useState(false);
  const [enregistree, setEnregistree] = useState(false);
  const [dejaProgrammee, setDejaProgrammee] = useState<ProgrammationExistante | null>(null);
  const [busy, setBusy] = useState(false);

  const [libelle, setLibelle] = useState(() => errandTitle.trim().slice(0, LIBELLE_MAX));
  const [rythme, setRythme] = useState<ScheduleRhythm>("weekly");
  const [jourSemaine, setJourSemaine] = useState(maintenant.getDay());
  // Au-delà du 28, la base refuse : on ne propose jamais une date qu'elle
  // rejetterait.
  const [jourMois, setJourMois] = useState(Math.min(maintenant.getDate(), 28));
  const [heure, setHeure] = useState(9);

  const libelleNet = libelle.trim();
  const libelleValide = libelleNet.length >= LIBELLE_MIN && libelleNet.length <= LIBELLE_MAX;

  // Une programmation déjà posée sur cette course doit se voir. Sans cette
  // lecture, la carte revenait à « Programmer cette course » au moindre
  // rechargement, et rien en base n'interdit d'en créer une seconde sur le même
  // modèle : le client qui doute reclique, et deux courses réelles repartent à
  // chaque échéance, chacune facturée.
  useEffect(() => {
    let annule = false;
    supabase
      .from("errand_schedules")
      .select("id,label,is_active,next_run_at")
      .eq("template_id", errandId)
      .maybeSingle()
      .then(({ data }) => {
        if (annule || !data) return;
        setDejaProgrammee(data as ProgrammationExistante);
      });
    return () => {
      annule = true;
    };
  }, [errandId]);

  const programmer = async () => {
    if (!libelleValide) {
      return toast.error(
        `Donnez un nom d'au moins ${LIBELLE_MIN} caractères à cette course programmée.`
      );
    }

    setBusy(true);
    // Le jour envoyé dépend du rythme : la table exige un jour de semaine pour
    // un rythme hebdomadaire, un jour du mois pour un rythme mensuel, et
    // refuse l'enregistrement quand le bon manque.
    const { error } = await supabase.rpc("errand_schedule_create", {
      p_errand_id: errandId,
      p_label: libelleNet,
      p_rhythm: rythme,
      p_hour: heure,
      ...(rythme === "monthly" ? { p_day_of_month: jourMois } : { p_day_of_week: jourSemaine }),
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    setEnregistree(true);
    toast.success("Course programmée. Elle repartira toute seule.");
    onCreated?.();
  };

  // Une programmation existe déjà pour cette course : on la montre au lieu de
  // proposer d'en créer une seconde, que rien en base n'interdirait.
  if (dejaProgrammee && !enregistree) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold">Course déjà programmée</h2>
        </div>
        <p className="mt-2 text-sm">
          <span className="font-medium">{dejaProgrammee.label}</span>
          {dejaProgrammee.is_active
            ? `, prochaine le ${new Date(dejaProgrammee.next_run_at).toLocaleDateString("fr-FR", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}.`
            : ", actuellement suspendue."}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Modifiez ou suspendez cette programmation depuis vos courses programmées.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3 min-h-[44px] w-full">
          <Link to="/courses/programmees">Mes courses programmées</Link>
        </Button>
      </section>
    );
  }

  if (enregistree) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold">Course programmée</h2>
        </div>
        <p className="mt-2 text-sm">{decrireRythme(rythme, jourSemaine, jourMois, heure)}.</p>
        <p className="mt-1 text-xs text-muted-foreground">
          La course repartira telle que vous l'avez décrite, tarifée au barème du jour. Vous pouvez
          la suspendre quand vous voulez.
        </p>
        <Button asChild size="sm" variant="outline" className="mt-3 min-h-[44px] w-full">
          <Link to="/courses/programmees">Mes courses programmées</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Programmer cette course</h2>
      </div>

      {!ouvert ? (
        <>
          <p className="mt-1 text-xs text-muted-foreground">
            Le marché du samedi, la pharmacie du mois : la même course repart au rythme que vous
            choisissez, sans que vous ayez à la redemander.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-3 min-h-[44px] w-full"
            onClick={() => setOuvert(true)}
          >
            Programmer cette course
          </Button>
        </>
      ) : (
        <div className="mt-3 space-y-3">
          <div>
            <Label className="text-xs" htmlFor="programmation-libelle">
              Nom de la programmation
            </Label>
            <Input
              id="programmation-libelle"
              value={libelle}
              maxLength={LIBELLE_MAX}
              className="mt-1"
              onChange={(e) => setLibelle(e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs" htmlFor="programmation-rythme">
              Rythme
            </Label>
            <select
              id="programmation-rythme"
              className={CHAMP_SELECT}
              value={rythme}
              onChange={(e) => setRythme(e.target.value as ScheduleRhythm)}
            >
              {RYTHMES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {rythme === "monthly" ? (
            <div>
              <Label className="text-xs" htmlFor="programmation-jour-mois">
                Jour du mois
              </Label>
              <select
                id="programmation-jour-mois"
                className={CHAMP_SELECT}
                value={jourMois}
                onChange={(e) => setJourMois(Number(e.target.value))}
              >
                {JOURS_DU_MOIS.map((j) => (
                  <option key={j} value={j}>
                    Le {j}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Le 29, le 30 et le 31 ne sont pas proposés : ces jours n'existent pas tous les mois,
                et la course sauterait les mois courts.
              </p>
            </div>
          ) : (
            <div>
              <Label className="text-xs" htmlFor="programmation-jour-semaine">
                Jour de la semaine
              </Label>
              <select
                id="programmation-jour-semaine"
                className={CHAMP_SELECT}
                value={jourSemaine}
                onChange={(e) => setJourSemaine(Number(e.target.value))}
              >
                {JOURS.map((jour, index) => (
                  <option key={jour} value={index}>
                    {jour.charAt(0).toUpperCase() + jour.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <Label className="text-xs" htmlFor="programmation-heure">
              Heure
            </Label>
            <select
              id="programmation-heure"
              className={CHAMP_SELECT}
              value={heure}
              onChange={(e) => setHeure(Number(e.target.value))}
            >
              {HEURES.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")} h
                </option>
              ))}
            </select>
          </div>

          <p className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
            {decrireRythme(rythme, jourSemaine, jourMois, heure)}. La course repartira telle que
            vous l'avez décrite, tarifée au barème du jour.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={busy}
              onClick={() => setOuvert(false)}
            >
              Revenir
            </Button>
            <Button
              size="sm"
              className="min-h-[44px]"
              disabled={busy || !libelleValide}
              onClick={() => void programmer()}
            >
              Programmer
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

export default ErrandScheduleCard;
