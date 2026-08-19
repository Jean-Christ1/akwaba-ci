import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { vibrer } from "@/shared/media/retourHaptique";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useErrandDetail,
  type ErrandOffer,
} from "@/modules/errands/application/useErrandDetail";
import {
  useMissionTracking,
  useOverrun,
} from "@/modules/errands/application/useMissionTracking";
import { BudgetOverrunNotice } from "@/modules/errands/ui/BudgetOverrunNotice";
import { ErrandChat } from "@/modules/errands/ui/ErrandChat";
import { ErrandInvoice } from "@/modules/errands/ui/ErrandInvoice";
import { ErrandItemList } from "@/modules/errands/ui/ErrandItemList";
import { ErrandOffers } from "@/modules/errands/ui/ErrandOffers";
import { ErrandPaymentPanel } from "@/modules/errands/ui/ErrandPaymentPanel";
import { ErrandScheduleCard } from "@/modules/errands/ui/ErrandScheduleCard";
import { ErrandTimeline } from "@/modules/errands/ui/ErrandTimeline";
import { HandoverCodeCard } from "@/modules/errands/ui/HandoverCodeCard";
import { MissionProgress } from "@/modules/errands/ui/MissionProgress";
import { RunnerContactCard } from "@/modules/errands/ui/RunnerContactCard";
import { TipCard } from "@/modules/errands/ui/TipCard";
import {
  formatFcfa,
  STATUS_LABEL,
  statusTone,
  type ErrandItem,
  type ErrandStatus,
} from "@/modules/errands/domain";

const NEXT_STATUS: Partial<Record<ErrandStatus, { next: ErrandStatus; label: string }>> = {
  assigned: { next: "shopping", label: "Je commence les courses" },
  shopping: { next: "delivering", label: "Je pars en livraison" },
  delivering: { next: "delivered", label: "Marquer comme livrée" },
};

const EN_MISSION: ErrandStatus[] = ["assigned", "shopping", "delivering"];

export type CancelDecision = { proceed: false } | { proceed: true; reason: string };

/**
 * Ce que répond la fenêtre de saisie du motif d'annulation.
 *
 * window.prompt rend null quand l'utilisateur ferme la fenêtre ou appuie sur
 * Échap, ce qui n'est pas une chaîne vide : c'est un refus. Les deux étaient
 * confondus par un `?? ""`, et l'appel à errand_cancel suivait sans condition.
 * La course était donc annulée alors que l'utilisateur venait de renoncer, et
 * une annulation ne se reprend pas.
 */
export function cancelDecision(prompted: string | null): CancelDecision {
  if (prompted === null) return { proceed: false };
  return { proceed: true, reason: prompted };
}

/**
 * Les cas où le serveur refuse déjà une annulation : course terminée, déjà
 * annulée, livrée (il renvoie vers le litige), ou dont le règlement est fait.
 * L'écran n'excluait ni la livraison ni le paiement : le bouton était proposé
 * sur une course livrée ou réglée, et le clic ne pouvait que retourner une
 * erreur. Le litige reste retiré de la liste, comme avant : une course déjà
 * contestée se tranche par le litige, pas par une annulation.
 */
const ANNULATION_REFUSEE: ErrandStatus[] = ["completed", "cancelled", "disputed", "delivered"];

/**
 * Le serveur refuse en outre l'annulation par le client dès que le shopper a
 * engagé les achats : l'annuler d'un clic le laisserait débiteur de sa
 * marchandise, sans recours, puisque le litige est refusé sur une course
 * annulée. Le shopper enregistre sa facture pendant « en courses » ou « en
 * livraison », donc ce cas se produit avant la livraison, dans le cours normal
 * d'une mission. Laisser le bouton actif y garantit une erreur.
 */
export function canCancelErrand(
  status: ErrandStatus,
  paymentStatus: string,
  achats: { itemsTotal: number; receiptUrl: string | null } = { itemsTotal: 0, receiptUrl: null }
): boolean {
  if (ANNULATION_REFUSEE.includes(status) || paymentStatus === "paid") return false;
  return achats.itemsTotal <= 0 && !achats.receiptUrl;
}

export default function ErrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { errand, offers, messages, runners, loading, messageErreur, recharger } =
    useErrandDetail(id, user?.id);

  // Code de remise saisi par le shopper au moment de la livraison.
  const [handoverInput, setHandoverInput] = useState("");
  const [busy, setBusy] = useState(false);

  const isCustomer = !!user && errand?.customer_id === user.id;
  const isRunner = !!user && errand?.runner_id === user.id;

  // Le suivi ne tourne que pour le shopper, mission en cours. Le temps continue
  // de courir tant que la course n'est pas terminée, et la distance se cumule.
  const missionEnCours = !!errand && EN_MISSION.includes(errand.status);

  const suivi = useMissionTracking(
    { errandId: errand?.id ?? "", actif: isRunner && missionEnCours },
    errand?.started_at ?? errand?.created_at ?? null
  );

  const { depassement } = useOverrun(
    errand?.id ?? "",
    !!errand && (missionEnCours || errand.status === "delivered")
  );

  // Toutes les opérations qui touchent à l'argent, au statut ou à l'affectation
  // passent par le moteur serveur : le client n'écrit jamais ces colonnes.
  const accepterOffre = async (offre: ErrandOffer) => {
    setBusy(true);
    const { error } = await supabase.rpc("errand_accept_offer", { p_offer_id: offre.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Shopper assigné !");
    recharger();
  };

  const avancer = async (next: ErrandStatus) => {
    if (!errand) return;
    // La remise en main propre exige le code à quatre chiffres détenu par le client.
    if (next === "delivered") {
      const code = handoverInput.replace(/\s/g, "");
      if (code.length < 4) {
        return toast.error("Demandez au client son code de remise à quatre chiffres.");
      }
      setBusy(true);

      // La vérification passe d'abord par sa fonction dédiée, car c'est elle
      // qui compte les échecs. La progression de statut ne peut pas le faire :
      // elle refuse un code faux en levant une exception, ce qui annulerait le
      // compteur qu'elle vient d'incrémenter. Sans ce premier appel, quatre
      // chiffres se devinent en dix mille essais sans que rien ne s'y oppose.
      const { data: valide, error: erreurCode } = await supabase.rpc(
        "errand_verify_handover_code",
        { p_errand_id: errand.id, p_code: code }
      );
      if (erreurCode) {
        setBusy(false);
        return toast.error(erreurCode.message);
      }
      if (!valide) {
        setBusy(false);
        setHandoverInput("");
        vibrer("echec");
        return toast.error(
          "Code de remise incorrect. Après cinq essais, la remise sera bloquée et devra être rouverte par un modérateur."
        );
      }

      const { error } = await supabase.rpc("errand_advance_status", {
        p_errand_id: errand.id,
        p_next: next,
        p_handover_code: code,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      setHandoverInput("");
      vibrer("succes");
      toast.success("Remise confirmée.");
      return recharger();
    }

    setBusy(true);
    const { error } = await supabase.rpc("errand_advance_status", {
      p_errand_id: errand.id,
      p_next: next,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    recharger();
  };

  const annuler = async () => {
    if (!errand) return;
    const decision = cancelDecision(window.prompt("Motif de l'annulation (facultatif)"));
    // Fermer la fenêtre, c'est renoncer : on ne va pas plus loin.
    if (!decision.proceed) return;
    setBusy(true);
    const { error } = await supabase.rpc("errand_cancel", {
      p_errand_id: errand.id,
      p_reason: decision.reason,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Course annulée.");
    recharger();
  };

  const ouvrirLitige = async () => {
    if (!errand) return;
    const motif = window.prompt("Décrivez le problème rencontré (10 caractères minimum)") ?? "";
    if (motif.trim().length < 10) {
      return toast.error("Merci de décrire le litige en quelques mots.");
    }
    setBusy(true);
    const { error } = await supabase.rpc("errand_open_dispute", {
      p_errand_id: errand.id,
      p_reason: motif.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Litige ouvert, un modérateur va intervenir.");
    recharger();
  };

  const noterShopper = async (valeur: number) => {
    if (!errand) return;
    setBusy(true);
    const { error } = await supabase.rpc("errand_rate_runner", {
      p_errand_id: errand.id,
      p_rating: valeur,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Merci pour votre note.");
    recharger();
  };

  if (loading) {
    return <div className="akw-container py-10 text-sm text-muted-foreground">Chargement…</div>;
  }

  if (!errand) {
    return (
      <div className="akw-container py-10 text-center text-sm">
        {messageErreur ? (
          <>
            <p className="font-medium text-destructive">Cette course n'a pas pu être chargée.</p>
            <p className="mt-1 text-muted-foreground">{messageErreur}</p>
          </>
        ) : (
          <p className="text-muted-foreground">Course introuvable.</p>
        )}
        <Link className="mt-3 inline-block text-primary" to="/courses">
          Revenir à mes courses
        </Link>
      </div>
    );
  }

  const articles: ErrandItem[] = Array.isArray(errand.items) ? (errand.items as ErrandItem[]) : [];
  const shopperAssigne = errand.runner_id ? runners[errand.runner_id] : undefined;
  const lienVisio = `https://meet.jit.si/akwaba-course-${id}`;
  const suiviVisible = missionEnCours || errand.status === "delivered";
  const annulationPossible = canCancelErrand(errand.status, errand.payment_status, {
    itemsTotal: Number(errand.items_total) || 0,
    receiptUrl: errand.receipt_url,
  });
  // Le pourboire s'inscrit tant que la course n'est pas réglée : après le
  // paiement, la fonction serveur le refuse. La remise faite est le moment où
  // le client sait ce qu'il doit à son shopper, juste avant de confirmer.
  const pourboirePossible =
    isCustomer && errand.status === "delivered" && errand.payment_status !== "paid";

  return (
    <div className="akw-container max-w-5xl py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="akw-eyebrow">Course #{errand.id.slice(0, 8)}</p>
          <h1 className="font-display text-2xl font-semibold">{errand.title}</h1>
          <p className="text-sm text-muted-foreground">
            {errand.zone ? `${errand.zone}, ` : ""}
            {errand.city} ·{" "}
            {errand.delivery_address ?? "Adresse exacte communiquée dès l'attribution de la course"}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(errand.status)}`}
        >
          {STATUS_LABEL[errand.status]}
        </span>
      </div>

      <ErrandTimeline status={errand.status} />

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {errand.budget_overrun_pending && (isCustomer || isRunner) && (
            <BudgetOverrunNotice
              errandId={errand.id}
              budgetEstimate={Number(errand.budget_estimate) || 0}
              itemsTotal={Number(errand.items_total) || 0}
              isCustomer={isCustomer}
              onApproved={recharger}
            />
          )}

          {/* La liste détaillée remplace l'énumération figée dès que la course
              est attribuée : c'est à partir de là qu'un article peut manquer et
              qu'un remplacement doit se décider, pas avant. */}
          {errand.runner_id ? (
            <ErrandItemList
              errandId={errand.id}
              isRunner={isRunner}
              isCustomer={isCustomer}
              figee={errand.payment_status === "paid"}
            />
          ) : (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-base font-semibold">Liste demandée</h2>
              <ul className="mt-2 space-y-1 text-sm">
                {articles.map((it, i) => (
                  <li
                    key={i}
                    className="flex justify-between border-b border-border/60 py-1 last:border-0"
                  >
                    <span>{it.label}</span>
                    <span className="text-muted-foreground">×{it.qty}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            {errand.notes && (
              <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                {errand.notes}
              </p>
            )}
            <p className="mt-3 text-sm">
              Budget estimé : <strong>{formatFcfa(errand.budget_estimate)}</strong>
            </p>
          </section>

          {isCustomer && errand.status === "open" && (
            <ErrandOffers
              offers={offers}
              runners={runners}
              busy={busy}
              onAccept={accepterOffre}
            />
          )}

          <ErrandChat
            errandId={errand.id}
            messages={messages}
            userId={user?.id}
            peutEcrire={isCustomer || isRunner}
          />
        </div>

        <aside className="space-y-4">
          {shopperAssigne && (
            <RunnerContactCard
              runner={shopperAssigne}
              errandTitle={errand.title}
              videoUrl={lienVisio}
            />
          )}

          {/* Le client garde son code sous les yeux pour le dicter au shopper. */}
          {isCustomer && EN_MISSION.includes(errand.status) && (
            <HandoverCodeCard errandId={errand.id} />
          )}

          {isRunner && NEXT_STATUS[errand.status] && (
            <div className="space-y-2">
              {errand.status === "delivering" && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <Label className="text-xs" htmlFor="remise">Code de remise du client</Label>
                  <Input
                    id="remise"
                    value={handoverInput}
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="1234"
                    className="mt-1 text-center text-lg tracking-[0.3em]"
                    onChange={(e) => setHandoverInput(e.target.value)}
                  />
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Demandez ce code au client au moment de lui remettre sa commande.
                  </p>
                </div>
              )}
              <Button
                className="w-full"
                disabled={busy}
                onClick={() => avancer(NEXT_STATUS[errand.status]!.next)}
              >
                {NEXT_STATUS[errand.status]!.label}
              </Button>
            </div>
          )}

          {/* Annulation et litige : les états cancelled et disputed sont désormais atteignables.
              Le litige reste ouvert sur une course livrée ou réglée, puisque c'est vers lui que le
              serveur renvoie ; seule l'annulation disparaît, faute d'être encore acceptée. */}
          {(isCustomer || isRunner) &&
            !["completed", "cancelled", "disputed"].includes(errand.status) && (
              <div className={`grid gap-2 ${annulationPossible ? "grid-cols-2" : "grid-cols-1"}`}>
                {annulationPossible && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={annuler}>
                    Annuler
                  </Button>
                )}
                <Button variant="outline" size="sm" disabled={busy} onClick={ouvrirLitige}>
                  Signaler un litige
                </Button>
              </div>
            )}

          {/* Notation du shopper une fois la mission réglée. */}
          {isCustomer && errand.status === "completed" && errand.rating == null && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-base font-semibold">Noter votre shopper</h2>
              <div className="mt-3 flex justify-between gap-2">
                {[1, 2, 3, 4, 5].map((v) => (
                  <Button
                    key={v}
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    disabled={busy}
                    onClick={() => noterShopper(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </section>
          )}

          {(isCustomer || isRunner) && suiviVisible && (
            <MissionProgress
              estimatedMinutes={Number(errand.estimated_minutes) || 0}
              estimatedDistanceKm={Number(errand.distance_km) || 0}
              minutesEcoulees={
                suivi.minutesEcoulees ||
                Math.max(
                  0,
                  Math.floor(
                    (Date.now() - new Date(errand.started_at ?? errand.created_at).getTime()) /
                      60000
                  )
                )
              }
              distanceParcourue={suivi.distanceParcourue || Number(errand.actual_distance_km) || 0}
              depassement={depassement}
              suiviActif={suivi.suiviActif}
              refusLocalisation={suivi.refus}
              role={isRunner ? "shopper" : "client"}
            />
          )}

          {/* Facture et règlement ne concernent que les parties : un shopper qui
              consulte le marché n'a rien à lire dans une facture encore vide. */}
          {(isCustomer || isRunner) && (
            <>
              <ErrandInvoice
                errand={errand}
                isCustomer={isCustomer}
                isRunner={isRunner}
                onSaved={recharger}
              />
              {/* Le pourboire se décide après la facture et avant la confirmation
                  du paiement : c'est le seul moment où le serveur l'accepte. */}
              {pourboirePossible && (
                <TipCard
                  errandId={errand.id}
                  currentTip={Number(errand.tip_amount) || 0}
                  paymentStatus={errand.payment_status}
                  onAdded={recharger}
                />
              )}
              <ErrandPaymentPanel
                errand={errand}
                isCustomer={isCustomer}
                isRunner={isRunner}
                onChanged={recharger}
              />
            </>
          )}

          {/* La programmation n'appartient qu'au client : la fonction serveur
              refuse toute course dont le demandeur n'est pas le propriétaire. */}
          {isCustomer && <ErrandScheduleCard errandId={errand.id} errandTitle={errand.title} />}
        </aside>
      </div>
    </div>
  );
}
