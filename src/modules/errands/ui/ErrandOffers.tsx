import { Button } from "@/components/ui/button";
import { formatFcfa } from "@/modules/errands/domain";
import type { ErrandOffer, RunnerCard } from "@/modules/errands/application/useErrandDetail";

interface ErrandOffersProps {
  offers: ErrandOffer[];
  runners: Record<string, RunnerCard>;
  busy: boolean;
  onAccept: (offer: ErrandOffer) => void;
}

/**
 * Offres reçues sur une course encore ouverte.
 *
 * Les offres écartées restent hors de la liste : le client choisit parmi ce
 * qui est encore acceptable, pas parmi un historique.
 */
export function ErrandOffers({ offers, runners, busy, onAccept }: ErrandOffersProps) {
  const enAttente = offers.filter((o) => o.status === "pending");
  const affichees = offers.filter((o) => o.status !== "rejected");

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">
        Offres reçues ({enAttente.length})
      </h2>
      {offers.length === 0 && (
        <p className="mt-2 text-sm text-muted-foreground">
          En attente des shoppers. Vous serez notifié en direct.
        </p>
      )}
      <ul className="mt-2 space-y-2">
        {affichees.map((o) => {
          const r = runners[o.runner_id];
          return (
            <li key={o.id} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{r?.full_name ?? "Shopper Akwaba"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r ? `${r.vehicle} · ${r.jobs_completed} missions · ★ ${r.rating}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{formatFcfa(o.price)}</p>
                  <p className="text-xs text-muted-foreground">~{o.eta_minutes} min</p>
                </div>
              </div>
              {o.message && <p className="mt-2 text-sm text-muted-foreground">{o.message}</p>}
              <Button size="sm" className="mt-2" disabled={busy} onClick={() => onAccept(o)}>
                Accepter cette offre
              </Button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ErrandOffers;
