import { useState } from "react";
import { Camera, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

export interface EtatPanier {
  fundMode: string;
  budgetEstimate: number | null;
  basketTotal: number | null;
  basketSubmittedAt: string | null;
  basketApprovedAt: string | null;
  basketRejectedAt: string | null;
  basketNote: string | null;
}

/**
 * Dit si le shopper doit faire valider son panier avant de payer.
 *
 * Uniquement quand il avance ses propres fonds. Dans les autres modes,
 * l'argent est déjà chez lui ou n'a pas encore quitté le client : le risque
 * n'est pas au même endroit, et imposer une étape de plus ralentirait sans
 * rien protéger.
 */
export function validationRequise(mode: string): boolean {
  return mode === "runner_advance";
}

interface BasketApprovalProps {
  errandId: string;
  etat: EtatPanier;
  /** « runner » côté shopper, « customer » côté client. */
  role: "runner" | "customer";
  onChange: () => void;
}

/**
 * Le panier soumis à l'accord du client avant le passage en caisse.
 *
 * C'est le moment de vérité du service. Quand le shopper avance ses propres
 * fonds, il engage son argent sur la parole d'un inconnu : si le client refuse
 * à l'arrivée, il reste avec des produits payés dont personne ne veut, et en
 * Côte d'Ivoire la marchandise ne se rend pas.
 *
 * En faisant valider le total avant l'achat, les deux s'engagent en même temps.
 * Le shopper sait qu'il ne paiera pas pour rien ; le client ne découvre plus le
 * montant après coup et ne peut plus annuler. L'accord est daté, attribué, et
 * le modérateur le voit quand il tranche un litige.
 *
 * Aucun prestataire de paiement n'intervient : rien d'argent ne bouge ici, on
 * ordonne seulement les engagements.
 */
export function BasketApproval({ errandId, etat, role, onChange }: BasketApprovalProps) {
  const [total, setTotal] = useState("");
  const [preuve, setPreuve] = useState<string | null>(null);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);

  if (!validationRequise(etat.fundMode)) return null;

  const soumettre = async () => {
    const montant = Number(total);
    if (!Number.isFinite(montant) || montant <= 0) {
      return toast.error("Indiquez le total réel de votre panier.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("errand_submit_basket", {
      p_errand_id: errandId,
      p_total: montant,
      p_proof_url: preuve ?? undefined,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Panier envoyé. Attendez son accord avant de payer.");
    setTotal("");
    onChange();
  };

  const decider = async (accepte: boolean) => {
    if (!accepte && motif.trim().length < 5) {
      return toast.error("Dites au shopper ce qui ne va pas : il doit savoir quoi corriger.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("errand_decide_basket", {
      p_errand_id: errandId,
      p_accepte: accepte,
      p_note: motif.trim() || undefined,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success(accepte ? "Panier validé." : "Panier refusé, le shopper est prévenu.");
    setMotif("");
    onChange();
  };

  const televerser = async (fichier: File) => {
    const { data: utilisateur } = await supabase.auth.getUser();
    if (!utilisateur.user) return;

    const extension = fichier.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const chemin = `${utilisateur.user.id}/panier-${errandId}.${extension}`;
    const { error } = await supabase.storage
      .from("errand-proofs")
      .upload(chemin, fichier, { upsert: true, contentType: fichier.type });
    if (error) return toast.error(error.message);
    setPreuve(chemin);
    toast.success("Photo du panier enregistrée.");
  };

  // --- Accord déjà donné -----------------------------------------------------
  if (etat.basketApprovedAt) {
    return (
      <section className="rounded-2xl border border-primary/40 bg-primary-soft p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-display text-base font-semibold text-primary">Panier validé</h2>
        </div>
        <p className="mt-2 text-sm text-foreground">
          {formatFcfa(etat.basketTotal ?? 0)}, accepté le{" "}
          {new Date(etat.basketApprovedAt).toLocaleDateString("fr-FR")}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {role === "runner"
            ? "Vous pouvez passer en caisse : cet accord est enregistré et daté. Le client ne peut plus l'annuler."
            : "Vous avez approuvé ce montant. Le shopper achète sur cette base, et cet accord ne peut plus être retiré."}
        </p>
      </section>
    );
  }

  // --- Le shopper attend une décision ---------------------------------------
  if (etat.basketSubmittedAt && role === "runner") {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-base font-semibold">Panier envoyé</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {formatFcfa(etat.basketTotal ?? 0)} en attente de l'accord du client.
        </p>
        {etat.basketRejectedAt && (
          <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2">
            <p className="text-sm font-medium text-destructive">Le client a refusé ce panier.</p>
            <p className="mt-1 text-xs text-muted-foreground">{etat.basketNote}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Corrigez, puis soumettez le nouveau panier ci-dessous.
            </p>
          </div>
        )}
        {etat.basketRejectedAt && (
          <div className="mt-3 space-y-2">
            <Label className="text-xs" htmlFor="nouveau-total">
              Nouveau total
            </Label>
            <Input
              id="nouveau-total"
              type="number"
              inputMode="decimal"
              className="min-h-[44px]"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
            <Button className="min-h-[44px]" disabled={busy} onClick={() => void soumettre()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Soumettre à nouveau
            </Button>
          </div>
        )}
      </section>
    );
  }

  // --- Le client décide ------------------------------------------------------
  if (etat.basketSubmittedAt && role === "customer") {
    return (
      <section className="rounded-2xl border border-accent/50 bg-accent-soft p-4">
        <h2 className="font-display text-base font-semibold">Votre panier attend votre accord</h2>
        <p className="mt-2 text-2xl font-semibold">{formatFcfa(etat.basketTotal ?? 0)}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Le shopper a réuni votre commande et attend avant de payer. Budget annoncé :{" "}
          {formatFcfa(etat.budgetEstimate ?? 0)}.
        </p>
        <p className="mt-2 text-xs text-muted-foreground text-pretty">
          En validant, vous vous engagez sur ce montant : le shopper paie de sa poche sur cette
          base, et vous ne pourrez plus annuler la course.
        </p>

        <div className="mt-3">
          <Label className="text-xs" htmlFor="motif-refus">
            Si vous refusez, dites pourquoi
          </Label>
          <Textarea
            id="motif-refus"
            className="mt-1"
            rows={2}
            placeholder="Trop cher, mauvaise marque, quantité incorrecte…"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="min-h-[44px]" disabled={busy} onClick={() => void decider(true)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            <Check className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Valider ce panier
          </Button>
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={busy}
            onClick={() => void decider(false)}
          >
            <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Refuser
          </Button>
        </div>
      </section>
    );
  }

  // --- Le shopper n'a rien soumis encore ------------------------------------
  if (role !== "runner") return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="font-display text-base font-semibold">Avant de payer</h2>
      <p className="mt-2 text-sm text-muted-foreground text-pretty">
        Vous avancez vos propres fonds sur cette course. Faites valider le total par le client
        avant de passer en caisse : sans son accord, rien ne vous protège d'un refus à l'arrivée.
      </p>

      <div className="mt-3">
        <Label className="text-xs" htmlFor="total-panier">
          Total réel du panier
        </Label>
        <Input
          id="total-panier"
          type="number"
          inputMode="decimal"
          className="mt-1 min-h-[44px]"
          placeholder="9500"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>

      <div className="mt-3">
        <Label className="flex items-center gap-1.5 text-xs" htmlFor="photo-panier">
          <Camera className="h-3.5 w-3.5" aria-hidden="true" />
          Photo du panier ou de l'écran de caisse
        </Label>
        <Input
          id="photo-panier"
          type="file"
          className="mt-1 min-h-[44px]"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) void televerser(fichier);
            e.target.value = "";
          }}
        />
        {preuve && <p className="mt-1 text-xs text-primary">Photo enregistrée.</p>}
      </div>

      <Button className="mt-4 min-h-[44px]" disabled={busy} onClick={() => void soumettre()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Envoyer au client pour accord
      </Button>
    </section>
  );
}

export default BasketApproval;
