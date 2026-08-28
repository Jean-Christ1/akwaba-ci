import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Loader2, QrCode, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";

interface Paiement {
  id: string;
  plafond: number;
  montant: number | null;
  etat: string;
  expire_le: string;
  merchant_id: string | null;
  motif: string | null;
}

interface Proprietes {
  errandId: string;
  /** Le budget engagé sur la course, qui borne le plafond proposé. */
  budget: number;
  /** Celui qui regarde : le client décide, le shopper présente. */
  role: "client" | "shopper";
  statut: string;
}

const LIBELLES: Record<string, string> = {
  ouvert: "En attente du comptoir",
  a_valider: "Le marchand demande un montant",
  regle: "Montant autorisé par le client",
  refuse: "Refusé",
  expire: "Expiré",
  annule: "Annulé",
};

/**
 * Le paiement au comptoir.
 *
 * Le shopper montre un code, le marchand saisit le montant, le client valide.
 * L'argent va du client au marchand, sans jamais passer par le shopper : c'est
 * toute la raison d'être de cet écran.
 *
 * Le code est affiché des deux côtés, et il le faut. Une première version ne le
 * rendait qu'au client, à l'instant de l'émission : le shopper, seul devant la
 * caisse, n'avait rien à présenter, et le dispositif entier ne servait à rien.
 * Il est désormais conservé chiffré et relu par une fonction qui vérifie qui
 * demande et laisse une trace de chaque relecture.
 *
 * Ce que cet écran ne dit pas, et ne doit pas dire : que le marchand a été
 * payé. Aucun prestataire n'est raccordé ; la validation autorise un montant et
 * enregistre ce qui est dû. Annoncer un virement pousserait le shopper à
 * remettre la marchandise sur la foi d'un règlement qui n'a pas eu lieu.
 */
export function CounterPaymentCard({ errandId, budget, role, statut }: Proprietes) {
  const [paiement, setPaiement] = useState<Paiement | null>(null);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [plafond, setPlafond] = useState(String(Math.round(budget || 0)));
  const [code, setCode] = useState<string | null>(null);
  const [image, setImage] = useState<string | null>(null);
  const [motif, setMotif] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    const { data } = await supabase
      .from("counter_payments")
      .select("id, plafond, montant, etat, expire_le, merchant_id, motif")
      .eq("errand_id", errandId)
      .in("etat", ["ouvert", "a_valider", "regle"])
      .order("emis_le", { ascending: false })
      .limit(1);
    const trouve = (data?.[0] as Paiement) ?? null;
    setPaiement(trouve);
    setChargement(false);
    if (!trouve || trouve.etat !== "ouvert") {
      setCode(null);
      return;
    }
    // Le code n'est lisible que par le client et le shopper de la course, et
    // seulement tant qu'il est vivant. Un refus ici n'est pas une erreur à
    // signaler : il veut dire que ce code ne nous concerne plus.
    const { data: clair } = await supabase.rpc("counter_payment_code", { p_id: trouve.id });
    if (typeof clair === "string") setCode(clair);
  }, [errandId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  useEffect(() => {
    if (!code) {
      setImage(null);
      return;
    }
    let annule = false;
    QRCode.toDataURL(code, { width: 320, margin: 1 })
      .then((url) => {
        if (!annule) setImage(url);
      })
      .catch(() => {
        // Sans image, le code reste lisible en clair juste en dessous : le
        // comptoir peut toujours le saisir à la main.
        if (!annule) setImage(null);
      });
    return () => {
      annule = true;
    };
  }, [code]);

  const ouvrir = async () => {
    const valeur = Number(plafond);
    if (!Number.isFinite(valeur) || valeur <= 0) {
      toast.error("Indiquez un plafond en francs.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("counter_payment_emettre", {
      p_errand_id: errandId,
      p_plafond: valeur,
      p_minutes: 90,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Code ouvert. Le shopper le voit de son côté.");
    await charger();
  };

  const decider = async (accepte: boolean) => {
    if (!paiement) return;
    setEnCours(true);
    const { error } = await supabase.rpc("counter_payment_decider", {
      p_id: paiement.id,
      p_accepte: accepte,
      p_motif: accepte ? null : motif || null,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(accepte ? "Montant autorisé." : "Paiement refusé.");
    setMotif("");
    await charger();
  };

  const annuler = async () => {
    if (!paiement) return;
    setEnCours(true);
    const { error } = await supabase.rpc("counter_payment_annuler", { p_id: paiement.id });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setCode(null);
    await charger();
  };

  if (chargement) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </section>
    );
  }

  const enCourse = statut === "assigned" || statut === "shopping";

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Payer le marchand sans passer par le shopper</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Le client fixe un plafond. Au comptoir, le marchand saisit le montant exact et le
        client l'autorise depuis son téléphone. Le shopper porte les courses, jamais l'argent.
      </p>

      {!paiement && role === "client" && enCourse && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div>
            <Label className="text-xs" htmlFor="plafond">
              Plafond autorisé (FCFA)
            </Label>
            <Input
              id="plafond"
              inputMode="numeric"
              value={plafond}
              onChange={(e) => setPlafond(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={() => void ouvrir()} disabled={enCours}>
            {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
            Ouvrir le paiement
          </Button>
        </div>
      )}

      {!paiement && role === "shopper" && (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Le client n'a pas encore ouvert de paiement au comptoir. Demandez-le-lui par le
          fil de discussion avant de passer en caisse, et n'avancez rien de votre poche.
        </p>
      )}

      {code && (
        <div className="mt-3 rounded-xl border border-primary/30 bg-primary-soft p-4 text-center">
          {image ? (
            <img
              src={image}
              alt="Code du paiement au comptoir, à présenter au marchand"
              className="mx-auto h-48 w-48"
            />
          ) : (
            <p className="text-xs text-muted-foreground">
              L'image n'a pas pu être produite. Le code reste lisible ci-dessous.
            </p>
          )}
          <p className="mt-2 font-mono text-lg font-semibold tracking-widest">
            {code.match(/.{1,4}/g)?.join(" ")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {role === "shopper"
              ? "Présentez ce code au comptoir. Il ne vous donne aucun droit sur l'argent."
              : "Le shopper voit ce même code depuis son écran."}
          </p>
        </div>
      )}

      {paiement && (
        <div className="mt-3 rounded-xl border border-border p-3">
          <p className="text-sm font-medium">
            {LIBELLES[paiement.etat] ?? paiement.etat}
            {paiement.montant != null && ` · ${formatFcfa(paiement.montant)}`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Plafond {formatFcfa(paiement.plafond)}, valable jusqu'à{" "}
            {new Date(paiement.expire_le).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}
            .
          </p>

          {paiement.etat === "a_valider" && role === "client" && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Vérifiez le montant avec le shopper avant d'autoriser. Une fois autorisé, ce
                paiement ne s'annule plus.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void decider(true)} disabled={enCours}>
                  Autoriser {formatFcfa(paiement.montant ?? 0)}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void decider(false)}
                  disabled={enCours}
                >
                  Refuser
                </Button>
              </div>
              <Input
                placeholder="Motif du refus (facultatif)"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                className="max-w-sm"
              />
            </div>
          )}

          {paiement.etat === "a_valider" && role === "shopper" && (
            <p className="mt-2 text-xs text-muted-foreground">
              Le client est en train de décider. N'avancez rien tant que ce n'est pas fait.
            </p>
          )}

          {paiement.etat === "ouvert" && role === "client" && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => void annuler()}
              disabled={enCours}
            >
              Annuler ce code
            </Button>
          )}

          {paiement.etat === "regle" && (
            <div className="mt-2 space-y-1">
              <p className="inline-flex items-center gap-1 text-xs text-primary">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Montant autorisé par le client. Le shopper n'a rien avancé.
              </p>
              <p className="text-xs text-muted-foreground">
                Le règlement au marchand est pris en charge par Akwaba, par le canal convenu
                avec lui. Il n'est pas instantané. Si le commerçant réclame un paiement
                immédiat, appelez le support plutôt que de payer de votre poche.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default CounterPaymentCard;
