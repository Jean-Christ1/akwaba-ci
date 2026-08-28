import { useCallback, useEffect, useState } from "react";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Marchand {
  id: string;
  nom: string;
  ville: string | null;
}

interface Lecture {
  id: string;
  reference: string;
  intitule: string;
  ville: string;
  plafond: number;
  expire_le: string;
}

/**
 * Le comptoir du marchand.
 *
 * Le shopper présente un code, le marchand le saisit ici, entre le montant
 * exact, et le client l'autorise depuis son téléphone.
 *
 * Deux choses que cet écran ne fait pas, volontairement. Il ne fixe jamais le
 * montant tout seul : c'est le commerçant qui le saisit, en face de sa caisse.
 * Et il ne crédite personne : l'autorisation du client enregistre ce qui est dû
 * au marchand, elle ne déclenche aucun virement. Le règlement passe par le
 * canal convenu entre Akwaba et le commerce, et il n'est pas instantané.
 *
 * Le dire est indispensable. Laisser croire que l'autorisation vaut paiement
 * ferait remettre la marchandise contre un virement qui n'a pas eu lieu, et
 * c'est le shopper, présent sur place, qui en répondrait.
 */
export default function MerchantCounterPage() {
  usePageTitle("Comptoir marchand", "Encaisser une course Akwaba au comptoir.");

  const [marchands, setMarchands] = useState<Marchand[]>([]);
  const [marchand, setMarchand] = useState<string>("");
  const [code, setCode] = useState("");
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [montant, setMontant] = useState("");
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    // La politique de lecture ne rend que les comptes marchands rattachés à
    // celui qui regarde, plus ceux que le personnel habilité peut voir. Un
    // commerçant ne voit donc que ses propres commerces, et un client ne voit
    // rien du tout : le registre n'a aucune raison de lui être ouvert.
    const { data } = await supabase
      .from("merchant_accounts")
      .select("id, nom, ville")
      .eq("actif", true)
      .order("nom");
    const liste = (data ?? []) as Marchand[];
    setMarchands(liste);
    if (liste.length === 1) setMarchand(liste[0].id);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const lire = async () => {
    const propre = code.replace(/\s+/g, "").toUpperCase();
    if (propre.length !== 16) {
      toast.error("Un code de paiement compte seize signes.");
      return;
    }
    setEnCours(true);
    const { data, error } = await supabase.rpc("counter_payment_lire", { p_code: propre });
    setEnCours(false);
    if (error) {
      setLecture(null);
      toast.error(error.message);
      return;
    }
    const vu = data as unknown as Lecture;
    setLecture(vu);
    setMontant(String(Math.round(vu.plafond)));
  };

  const demander = async () => {
    if (!lecture || !marchand) return;
    const valeur = Number(montant);
    if (!Number.isFinite(valeur) || valeur <= 0) {
      toast.error("Indiquez le montant exact du ticket.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("counter_payment_demander", {
      p_code: code.replace(/\s+/g, "").toUpperCase(),
      p_montant: valeur,
      p_merchant_id: marchand,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Demande envoyée au client. Attendez son autorisation.");
    setLecture(null);
    setCode("");
    setMontant("");
  };

  return (
    <div className="akw-container max-w-xl py-8">
      <header className="flex items-center gap-2">
        <Store className="h-5 w-5 text-primary" aria-hidden="true" />
        <h1 className="font-display text-2xl font-semibold">Comptoir marchand</h1>
      </header>
      <p className="mt-2 text-sm text-muted-foreground">
        Saisissez le code présenté par le shopper, puis le montant exact du ticket. Le
        client autorise le montant depuis son téléphone.
      </p>
      <p className="mt-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        L'autorisation du client n'est pas un virement. Elle enregistre ce qu'Akwaba vous
        doit ; le règlement vous parvient ensuite par le canal convenu, il n'est pas
        instantané. Ne demandez pas au shopper de payer de sa poche.
      </p>

      {marchands.length === 0 && (
        <p className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Aucun compte marchand ne vous est rattaché. Contactez Akwaba pour être inscrit et
          vérifié : un marchand non vérifié ne peut pas encaisser.
        </p>
      )}

      {marchands.length > 1 && (
        <div className="mt-4">
          <Label className="text-xs">Encaisser pour</Label>
          <Select value={marchand} onValueChange={setMarchand}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir le commerce" />
            </SelectTrigger>
            <SelectContent>
              {marchands.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.nom}
                  {m.ville ? ` · ${m.ville}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="mt-4">
        <Label className="text-xs" htmlFor="code">
          Code du paiement
        </Label>
        <div className="mt-1 flex gap-2">
          <Input
            id="code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="A1B2 C3D4 E5F6 7890"
            className="font-mono tracking-widest"
          />
          <Button variant="outline" onClick={() => void lire()} disabled={enCours}>
            {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
            Lire
          </Button>
        </div>
      </div>

      {lecture && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-primary-soft p-4">
          <p className="text-sm font-medium">{lecture.intitule}</p>
          <p className="text-xs text-muted-foreground">
            Course {lecture.reference} · {lecture.ville} · plafond{" "}
            {formatFcfa(lecture.plafond)}
          </p>

          <div className="mt-3">
            <Label className="text-xs" htmlFor="montant">
              Montant du ticket (FCFA)
            </Label>
            <Input
              id="montant"
              inputMode="numeric"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              className="w-44"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Au-delà du plafond, la demande est refusée par la plateforme.
            </p>
          </div>

          <Button className="mt-3" onClick={() => void demander()} disabled={enCours || !marchand}>
            {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
            Demander l'autorisation du client
          </Button>
        </div>
      )}
    </div>
  );
}
