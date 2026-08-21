import { AlertTriangle, Clock, MapPin, Navigation } from "lucide-react";

import { formatFcfa } from "@/modules/errands/domain";
import { cn } from "@/lib/utils";

interface MissionProgressProps {
  estimatedMinutes: number;
  estimatedDistanceKm: number;
  minutesEcoulees: number;
  distanceParcourue: number;
  depassement: {
    overtimeMinutes: number;
    extraDistanceKm: number;
    overrunFee: number;
    capped: boolean;
  } | null;
  suiviActif: boolean;
  refusLocalisation: boolean;
  /** Le shopper voit son gain, le client voit ce qu'il paiera. */
  role: "client" | "shopper";
}

/**
 * Avancement réel de la mission, en regard de l'estimation.
 *
 * Les deux parties voient la même chose, au même moment : c'est ce qui rend un
 * dépassement discutable sereinement plutôt que découvert sur la facture.
 */
export function MissionProgress({
  estimatedMinutes,
  estimatedDistanceKm,
  minutesEcoulees,
  distanceParcourue,
  depassement,
  suiviActif,
  refusLocalisation,
  role,
}: MissionProgressProps) {
  const tempsDepasse = minutesEcoulees > estimatedMinutes;
  const distanceDepassee = distanceParcourue > estimatedDistanceKm;
  const supplement = depassement?.overrunFee ?? 0;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Navigation className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Avancement de la mission</h2>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-background p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Temps
          </dt>
          <dd className={cn("mt-1 font-display text-lg font-semibold", tempsDepasse && "text-accent")}>
            {minutesEcoulees} min
          </dd>
          <dd className="text-[11px] text-muted-foreground">estimé {estimatedMinutes} min</dd>
        </div>

        <div className="rounded-xl border border-border bg-background p-3">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Distance
          </dt>
          <dd
            className={cn(
              "mt-1 font-display text-lg font-semibold",
              distanceDepassee && "text-accent"
            )}
          >
            {distanceParcourue.toFixed(1)} km
          </dd>
          <dd className="text-[11px] text-muted-foreground">
            estimé {estimatedDistanceKm.toFixed(1)} km
          </dd>
        </div>
      </dl>

      {supplement > 0 && (
        <div className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Dépassement constaté
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {depassement!.overtimeMinutes > 0 && `${depassement!.overtimeMinutes} min de plus`}
            {depassement!.overtimeMinutes > 0 && depassement!.extraDistanceKm > 0 && ", "}
            {depassement!.extraDistanceKm > 0 &&
              `${depassement!.extraDistanceKm.toFixed(1)} km de plus`}
            {" que prévu."}
          </p>
          <p className="mt-1.5 text-sm font-semibold">
            {role === "shopper" ? "Supplément pour vous" : "Supplément à régler"} :{" "}
            {formatFcfa(supplement)}
          </p>
          {depassement!.capped && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Le supplément est plafonné : au delà, il reste à la charge de la plateforme.
            </p>
          )}
        </div>
      )}

      {role === "shopper" && !suiviActif && (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {refusLocalisation
            ? "Localisation refusée : la distance parcourue ne sera pas comptée, et un éventuel supplément kilométrique ne pourra pas vous être versé."
            : "Recherche de votre position..."}
        </p>
      )}
    </section>
  );
}

export default MissionProgress;
