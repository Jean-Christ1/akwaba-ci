import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Phone, Video, MessageCircle, Send, CheckCircle2, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdvancePanel } from "@/modules/errands/ui/AdvancePanel";
import { ProofUpload } from "@/modules/errands/ui/ProofUpload";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeInvoice,
  formatFcfa,
  PAY_METHODS,
  STATUS_LABEL,
  STATUS_STEPS,
  statusTone,
  waLink,
  type ErrandItem,
  type ErrandStatus,
} from "@/modules/errands/domain";

interface Errand {
  id: string;
  customer_id: string;
  runner_id: string | null;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  delivery_address: string;
  items: unknown;
  notes: string | null;
  budget_estimate: number;
  preferred_contact: string;
  scheduled_for: string | null;
  status: ErrandStatus;
  items_total: number;
  service_fee: number;
  delivery_fee: number;
  commission_rate: number;
  commission_amount: number;
  total_amount: number;
  payment_method: string;
  payment_status: string;
  fund_mode: string;
  advance_proof_url: string | null;
  advance_amount: number;
  receipt_url: string | null;
  rating: number | null;
  review: string | null;
  tip_amount: number;
  created_at: string;
}

interface Offer {
  id: string;
  runner_id: string;
  price: number;
  eta_minutes: number;
  message: string | null;
  status: string;
}

interface Msg {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

interface RunnerCard {
  user_id: string;
  full_name: string;
  /** Renseigné uniquement pour le shopper assigné à la course. */
  phone: string | null;
  /** Renseigné uniquement pour le shopper assigné à la course. */
  whatsapp: string | null;
  city: string;
  vehicle: string;
  rating: number;
  jobs_completed: number;
}

const NEXT_STATUS: Partial<Record<ErrandStatus, { next: ErrandStatus; label: string }>> = {
  assigned: { next: "shopping", label: "Je commence les courses" },
  shopping: { next: "delivering", label: "Je pars en livraison" },
  delivering: { next: "delivered", label: "Marquer comme livrée" },
};

export default function ErrandDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [errand, setErrand] = useState<Errand | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [runners, setRunners] = useState<Record<string, RunnerCard>>({});
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [itemsTotal, setItemsTotal] = useState("");
  const [serviceFee, setServiceFee] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("");

  // Code de remise saisi par le shopper au moment de la livraison.
  const [handoverInput, setHandoverInput] = useState("");
  // Code de remise du client, chargé à la demande via une fonction serveur.
  const [handoverCode, setHandoverCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isCustomer = !!user && errand?.customer_id === user.id;
  const isRunner = !!user && errand?.runner_id === user.id;

  const load = useCallback(async () => {
    if (!id) return;
    // Liste de colonnes explicite : le code de remise ne doit jamais partir
    // vers le navigateur du shopper, sans quoi il pourrait valider lui-même la
    // remise sans avoir rencontré le client. Le client l'obtient par la
    // fonction dédiée, qui vérifie son identité.
    const { data: e } = await supabase
      .from("errands")
      .select(
        "id,customer_id,runner_id,title,category,city,zone,delivery_address,items,notes,budget_estimate,preferred_contact,scheduled_for,status,items_total,service_fee,delivery_fee,commission_rate,commission_amount,total_amount,payment_method,payment_status,receipt_url,rating,review,created_at,fund_mode,advance_amount,advance_proof_url,balance_due,tip_amount"
      )
      .eq("id", id)
      .maybeSingle();
    if (!e) {
      setLoading(false);
      return;
    }
    setErrand(e as Errand);
    setItemsTotal(String(e.items_total || ""));
    setServiceFee(String(e.service_fee || ""));
    setDeliveryFee(String(e.delivery_fee || ""));

    const [{ data: o }, { data: m }] = await Promise.all([
      supabase.from("errand_offers").select("*").eq("errand_id", id).order("created_at"),
      supabase.from("errand_messages").select("id,sender_id,body,created_at").eq("errand_id", id).order("created_at"),
    ]);
    setOffers((o ?? []) as Offer[]);
    setMessages((m ?? []) as Msg[]);

    const ids = Array.from(
      new Set([...(o ?? []).map((x) => x.runner_id), e.runner_id].filter(Boolean) as string[])
    );
    if (ids.length) {
      // Vitrine publique des shoppers : nom, ville, véhicule, réputation.
      // Ne contient jamais de coordonnées, y compris pour les offres reçues.
      const { data: pub } = await supabase
        .from("runner_public_profiles")
        .select("user_id,full_name,city,vehicle,rating,jobs_completed")
        .in("user_id", ids);

      const cards: Record<string, RunnerCard> = Object.fromEntries(
        (pub ?? []).map((r) => [
          r.user_id as string,
          {
            user_id: r.user_id as string,
            full_name: r.full_name ?? "Shopper",
            phone: null,
            whatsapp: null,
            city: r.city ?? "",
            vehicle: r.vehicle ?? "",
            rating: Number(r.rating ?? 0),
            jobs_completed: Number(r.jobs_completed ?? 0),
          },
        ])
      );

      // Les coordonnées ne sont révélées que pour le shopper effectivement
      // assigné, afin que l'appel et le WhatsApp fonctionnent pendant la mission.
      if (e.runner_id) {
        const { data: assigned } = await supabase
          .from("runner_profiles")
          .select("user_id,full_name,phone,whatsapp,city,vehicle,rating,jobs_completed")
          .eq("user_id", e.runner_id)
          .maybeSingle();
        if (assigned) cards[assigned.user_id] = assigned as RunnerCard;
      }

      setRunners(cards);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`errand-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "errand_messages", filter: `errand_id=eq.${id}` },
        (payload) => setMessages((p) => [...p, payload.new as Msg])
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "errands", filter: `id=eq.${id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "errand_offers", filter: `errand_id=eq.${id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const invoice = useMemo(
    () =>
      computeInvoice({
        itemsTotal: Number(itemsTotal) || 0,
        serviceFee: Number(serviceFee) || 0,
        deliveryFee: Number(deliveryFee) || 0,
        commissionRate: errand?.commission_rate ?? 0.1,
      }),
    [itemsTotal, serviceFee, deliveryFee, errand?.commission_rate]
  );

  const list: ErrandItem[] = Array.isArray(errand?.items) ? (errand!.items as ErrandItem[]) : [];
  const assignedRunner = errand?.runner_id ? runners[errand.runner_id] : undefined;
  const videoUrl = `https://meet.jit.si/akwaba-course-${id}`;

  const send = async () => {
    if (!draft.trim() || !user || !id) return;
    const body = draft.trim();
    setDraft("");
    const { error } = await supabase.from("errand_messages").insert({ errand_id: id, sender_id: user.id, body });
    if (error) toast.error(error.message);
  };

  // Toutes les opérations qui touchent à l'argent, au statut ou à l'affectation
  // passent par le moteur serveur : le client n'écrit jamais ces colonnes.
  const acceptOffer = async (offer: Offer) => {
    if (!errand) return;
    setBusy(true);
    const { error } = await supabase.rpc("errand_accept_offer", { p_offer_id: offer.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Shopper assigné !");
    load();
  };

  const advance = async (next: ErrandStatus) => {
    if (!errand || !user) return;
    // La remise en main propre exige le code à quatre chiffres détenu par le client.
    if (next === "delivered") {
      const code = handoverInput.replace(/\s/g, "");
      if (code.length < 4) {
        return toast.error("Demandez au client son code de remise à quatre chiffres.");
      }
      setBusy(true);
      const { error } = await supabase.rpc("errand_advance_status", {
        p_errand_id: errand.id,
        p_next: next,
        p_handover_code: code,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      setHandoverInput("");
      toast.success("Remise confirmée.");
      return load();
    }

    setBusy(true);
    const { error } = await supabase.rpc("errand_advance_status", {
      p_errand_id: errand.id,
      p_next: next,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    load();
  };

  const saveInvoice = async () => {
    if (!errand) return;
    setBusy(true);
    const { error } = await supabase.rpc("errand_save_invoice", {
      p_errand_id: errand.id,
      p_items_total: Number(itemsTotal) || 0,
      p_delivery_fee: Number(deliveryFee) || 0,
      p_tip_amount: 0,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Facture enregistrée");
    load();
  };

  const confirmPayment = async () => {
    if (!errand || !user) return;
    setBusy(true);
    const { error } = await supabase.rpc("errand_confirm_payment", { p_errand_id: errand.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Course terminée. Merci !");
    load();
  };

  const cancelErrand = async () => {
    if (!errand) return;
    const reason = window.prompt("Motif de l'annulation (facultatif)") ?? "";
    setBusy(true);
    const { error } = await supabase.rpc("errand_cancel", {
      p_errand_id: errand.id,
      p_reason: reason,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Course annulée.");
    load();
  };

  const openDispute = async () => {
    if (!errand) return;
    const reason = window.prompt("Décrivez le problème rencontré (10 caractères minimum)") ?? "";
    if (reason.trim().length < 10) {
      return toast.error("Merci de décrire le litige en quelques mots.");
    }
    setBusy(true);
    const { error } = await supabase.rpc("errand_open_dispute", {
      p_errand_id: errand.id,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Litige ouvert, un modérateur va intervenir.");
    load();
  };

  const rateRunner = async (value: number) => {
    if (!errand) return;
    setBusy(true);
    const { error } = await supabase.rpc("errand_rate_runner", {
      p_errand_id: errand.id,
      p_rating: value,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Merci pour votre note.");
    load();
  };

  if (loading) return <div className="akw-container py-10 text-sm text-muted-foreground">Chargement…</div>;
  if (!errand)
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Course introuvable. <Link className="text-primary" to="/courses">Mes courses</Link>
      </div>
    );

  const stepIndex = STATUS_STEPS.indexOf(errand.status);

  return (
    <div className="akw-container max-w-5xl py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="akw-eyebrow">Course #{errand.id.slice(0, 8)}</p>
          <h1 className="font-display text-2xl font-semibold">{errand.title}</h1>
          <p className="text-sm text-muted-foreground">
            {errand.zone ? `${errand.zone}, ` : ""}{errand.city} · {errand.delivery_address}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${statusTone(errand.status)}`}>
          {STATUS_LABEL[errand.status]}
        </span>
      </div>

      {stepIndex >= 0 && (
        <ol className="mt-4 flex flex-wrap gap-1.5">
          {STATUS_STEPS.map((s, i) => (
            <li
              key={s}
              className={`rounded-full px-2.5 py-1 text-[11px] ${
                i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {STATUS_LABEL[s]}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="font-display text-base font-semibold">Liste demandée</h2>
            <ul className="mt-2 space-y-1 text-sm">
              {list.map((it, i) => (
                <li key={i} className="flex justify-between border-b border-border/60 py-1 last:border-0">
                  <span>{it.label}</span>
                  <span className="text-muted-foreground">×{it.qty}</span>
                </li>
              ))}
            </ul>
            {errand.notes && (
              <p className="mt-3 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">{errand.notes}</p>
            )}
            <p className="mt-3 text-sm">
              Budget estimé : <strong>{formatFcfa(errand.budget_estimate)}</strong>
            </p>
          </section>

          {isCustomer && errand.status === "open" && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-base font-semibold">
                Offres reçues ({offers.filter((o) => o.status === "pending").length})
              </h2>
              {offers.length === 0 && (
                <p className="mt-2 text-sm text-muted-foreground">
                  En attente des shoppers. Vous serez notifié en direct.
                </p>
              )}
              <ul className="mt-2 space-y-2">
                {offers.filter((o) => o.status !== "rejected").map((o) => {
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
                      <Button size="sm" className="mt-2" onClick={() => acceptOffer(o)}>
                        Accepter cette offre
                      </Button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="flex h-[420px] flex-col rounded-2xl border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <MessageCircle className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold">Discussion</h2>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Aucun message. Coordonnez-vous ici en temps réel.
                </p>
              )}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                    m.sender_id === user?.id
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.body}
                  <span className="mt-0.5 block text-[10px] opacity-70">
                    {new Date(m.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
            {(isCustomer || isRunner) && (
              <div className="flex gap-2 border-t border-border p-3">
                <Input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Écrire un message…"
                />
                <Button size="icon" onClick={send} aria-label="Envoyer">
                  <Send className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          {assignedRunner && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-base font-semibold">Votre shopper</h2>
              <p className="mt-1 text-sm">{assignedRunner.full_name}</p>
              <p className="text-xs text-muted-foreground">
                {assignedRunner.vehicle} · ★ {assignedRunner.rating} · {assignedRunner.jobs_completed} missions
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Button asChild variant="outline" size="sm" disabled={!assignedRunner.phone}>
                  <a
                    href={assignedRunner.phone ? `tel:${assignedRunner.phone}` : undefined}
                    aria-label={`Appeler ${assignedRunner.full_name}`}
                  >
                    <Phone className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  disabled={!assignedRunner.whatsapp && !assignedRunner.phone}
                >
                  <a
                    href={waLink(assignedRunner.whatsapp ?? assignedRunner.phone, `Bonjour, à propos de la course "${errand.title}"`) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Écrire à ${assignedRunner.full_name} sur WhatsApp`}
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <a href={videoUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir la visioconférence">
                    <Video className="h-4 w-4" aria-hidden="true" />
                  </a>
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">Appel · WhatsApp · Visio</p>
            </section>
          )}

          {/* Le client garde son code sous les yeux pour le dicter au shopper. */}
          {isCustomer && ["assigned", "shopping", "delivering"].includes(errand.status) && (
            <section className="rounded-2xl border border-border bg-card p-4">
              <h2 className="font-display text-base font-semibold">Code de remise</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Communiquez ce code au shopper seulement quand vous avez reçu votre commande.
                Il en a besoin pour clôturer la mission.
              </p>
              {handoverCode ? (
                <p className="mt-3 text-center font-display text-3xl font-semibold tracking-[0.3em]">
                  {handoverCode}
                </p>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full"
                  disabled={busy}
                  onClick={async () => {
                    const { data, error } = await supabase.rpc("errand_handover_code", {
                      p_errand_id: errand.id,
                    });
                    if (error) return toast.error(error.message);
                    if (!data) return toast.error("Aucun code de remise pour cette course.");
                    setHandoverCode(data as string);
                  }}
                >
                  Afficher mon code
                </Button>
              )}
            </section>
          )}

          {isRunner && NEXT_STATUS[errand.status] && (
            <div className="space-y-2">
              {errand.status === "delivering" && (
                <div className="rounded-2xl border border-border bg-card p-4">
                  <Label className="text-xs">Code de remise du client</Label>
                  <Input
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
                onClick={() => advance(NEXT_STATUS[errand.status]!.next)}
              >
                {NEXT_STATUS[errand.status]!.label}
              </Button>
            </div>
          )}

          {/* Annulation et litige : les états cancelled et disputed sont désormais atteignables. */}
          {(isCustomer || isRunner) &&
            !["completed", "cancelled", "disputed"].includes(errand.status) && (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" disabled={busy} onClick={cancelErrand}>
                  Annuler
                </Button>
                <Button variant="outline" size="sm" disabled={busy} onClick={openDispute}>
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
                    onClick={() => rateRunner(v)}
                  >
                    {v}
                  </Button>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-primary" aria-hidden="true" />
              <h2 className="font-display text-base font-semibold">Facturation</h2>
            </div>
            {isRunner && errand.status !== "completed" ? (
              <div className="mt-3 space-y-2">
                <div>
                  <Label className="text-xs">Total des achats</Label>
                  <Input value={itemsTotal} inputMode="numeric"
                    onChange={(e) => setItemsTotal(e.target.value.replace(/[^0-9]/g, ""))} />
                </div>
                <div>
                  <Label className="text-xs">Frais de service</Label>
                  <Input value={serviceFee} inputMode="numeric"
                    onChange={(e) => setServiceFee(e.target.value.replace(/[^0-9]/g, ""))} />
                </div>
                <div>
                  <Label className="text-xs">Frais de livraison</Label>
                  <Input value={deliveryFee} inputMode="numeric"
                    onChange={(e) => setDeliveryFee(e.target.value.replace(/[^0-9]/g, ""))} />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={busy}
                  onClick={saveInvoice}
                >
                  Enregistrer la facture
                </Button>
                <ProofUpload
                  errandId={errand.id}
                  kind="receipt"
                  existingPath={errand.receipt_url}
                  amount={Number(itemsTotal) || 0}
                  onUploaded={load}
                />
              </div>
            ) : null}

            {/* Le client voit sur quel compte envoyer le budget, déclare le
                montant transféré, puis dépose sa preuve. */}
            {isCustomer && errand.fund_mode === "customer_advance" && errand.payment_status !== "paid" && (
              <div className="mt-3 space-y-3">
                <AdvancePanel
                  errandId={errand.id}
                  budgetEstimate={Number(errand.budget_estimate) || 0}
                  advanceAmount={Number(errand.advance_amount) || 0}
                  advanceConfirmed={Boolean(errand.advance_proof_url) || Number(errand.advance_amount) > 0}
                  onDeclared={load}
                />
                <ProofUpload
                  errandId={errand.id}
                  kind="advance"
                  existingPath={errand.advance_proof_url}
                  amount={Number(errand.advance_amount) || Number(errand.budget_estimate) || 0}
                  onUploaded={load}
                />
              </div>
            )}

            {/* Le reçu déposé par le shopper reste consultable par le client. */}
            {isCustomer && errand.receipt_url && (
              <div className="mt-3">
                <ProofUpload
                  errandId={errand.id}
                  kind="receipt"
                  existingPath={errand.receipt_url}
                  onUploaded={load}
                />
              </div>
            )}

            <dl className="mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Achats</dt><dd>{formatFcfa(invoice.items)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Service</dt><dd>{formatFcfa(invoice.service)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Livraison</dt><dd>{formatFcfa(invoice.delivery)}</dd></div>
              <div className="flex justify-between border-t border-border pt-1 font-semibold">
                <dt>Total à payer</dt><dd>{formatFcfa(invoice.total)}</dd>
              </div>
              {/* Une avance déjà envoyée doit se déduire à l'écran : sans cela,
                  le client ne sait pas ce qu'il lui reste réellement à régler. */}
              {Number(errand.advance_amount) > 0 && (
                <>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <dt>Avance déjà envoyée</dt>
                    <dd>- {formatFcfa(errand.advance_amount)}</dd>
                  </div>
                  <div className="flex justify-between font-semibold text-primary">
                    <dt>Reste à régler</dt>
                    <dd>{formatFcfa(Math.max(invoice.total - Number(errand.advance_amount), 0))}</dd>
                  </div>
                </>
              )}
              {isRunner && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <dt>Votre gain (après {Math.round(invoice.commissionRate * 100)}% Akwaba)</dt>
                  <dd>{formatFcfa(invoice.runnerPayout)}</dd>
                </div>
              )}
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Paiement : {PAY_METHODS.find((p) => p.value === errand.payment_method)?.label} ·{" "}
              {errand.payment_status === "paid" ? "Réglé" : "En attente"}
            </p>
            {isCustomer && errand.payment_status !== "paid" && errand.status === "delivered" && (
              <Button className="mt-3 w-full" onClick={confirmPayment}>
                <CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Confirmer le paiement
              </Button>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
