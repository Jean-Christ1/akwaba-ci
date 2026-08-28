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

interface Marchand {
  id: string;
  nom: string;
  ville: string | null;
  moyen: string;
  actif: boolean;
  verifie_le: string | null;
  user_id: string | null;
}

// Le virement bancaire n'est pas propose : le type de paiement des courses ne
// le connait pas, et l'inscription serait refusee par la base. Mieux vaut ne
// pas l'offrir que le faire echouer apres la saisie.
const MOYENS = [
  { value: "wave", label: "Wave" },
  { value: "orange_money", label: "Orange Money" },
  { value: "mtn_momo", label: "MTN MoMo" },
  { value: "moov_money", label: "Moov Money" },
];

const NEUF = { nom: "", ville: "", moyen: "wave", numero: "" };

/**
 * Le registre des marchands encaisseurs.
 *
 * Un marchand doit exister ici avant de recevoir un franc. Sans registre,
 * n'importe qui pourrait se déclarer bénéficiaire au moment de l'encaissement,
 * et le premier à le faire serait le shopper de la course.
 *
 * La vérification n'est pas une formalité : c'est le seul moment où quelqu'un
 * regarde à qui l'argent ira. Tant qu'un marchand n'est pas vérifié, la base
 * refuse tout encaissement à son nom.
 *
 * Le numéro d'encaissement n'est jamais rendu à cet écran : la lecture est
 * accordée colonne par colonne et celle-là en est exclue, et la fonction
 * d'inscription ne le renvoie pas non plus. On le saisit, on ne le relit pas.
 *
 * Conséquence sur la correction d'un numéro. Réinscrire le même commerce avec
 * un autre numéro ne corrige rien : la clé d'unicité porte sur le couple moyen
 * et numéro, donc une seconde ligne apparaît, et deux bénéficiaires portent le
 * même nom. La marche à suivre est de suspendre la ligne fautive, puis d'en
 * inscrire une nouvelle avec le bon numéro.
 */
export function MerchantsEditor() {
  const [marchands, setMarchands] = useState<Marchand[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [nouveau, setNouveau] = useState({ ...NEUF });

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase
      .from("merchant_accounts")
      .select("id, nom, ville, moyen, actif, verifie_le, user_id")
      .order("nom");
    setChargement(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setMarchands((data ?? []) as Marchand[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const rattacher = async (m: Marchand) => {
    // Sans compte rattache, le commercant ne voit rien : la politique de
    // lecture ne lui montre que ses propres comptes. Le registre existerait,
    // mais personne ne pourrait s'en servir.
    const courriel = window.prompt(
      m.user_id
        ? "Nouvelle adresse du gérant, ou vide pour détacher le compte :"
        : "Adresse du compte Akwaba du gérant :",
      ""
    );
    if (courriel === null) return;
    setEnCours(true);
    const { error } = await supabase.rpc("merchant_rattacher", {
      p_id: m.id,
      p_email: courriel.trim() || null,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(courriel.trim() ? "Compte rattaché." : "Compte détaché.");
    await charger();
  };

  const basculer = async (m: Marchand) => {
    setEnCours(true);
    const { error } = await supabase.rpc("merchant_basculer", {
      p_id: m.id,
      p_actif: !m.actif,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(m.actif ? "Marchand suspendu." : "Marchand réactivé.");
    await charger();
  };

  const enregistrer = async (verifier: boolean) => {
    if (nouveau.nom.trim().length < 2 || nouveau.numero.trim().length < 6) {
      toast.error("Il faut un nom et un numéro d'encaissement.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("merchant_enregistrer", {
      p_nom: nouveau.nom.trim(),
      p_moyen: nouveau.moyen,
      p_numero: nouveau.numero.trim(),
      p_ville: nouveau.ville.trim() || null,
      p_place_id: null,
      p_user_id: null,
      p_verifier: verifier,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(verifier ? "Marchand inscrit et vérifié." : "Marchand inscrit, à vérifier.");
    setNouveau({ ...NEUF });
    await charger();
  };

  if (chargement) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <Store className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Marchands encaisseurs</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Un marchand non vérifié ne peut pas encaisser, et un marchand sans compte rattaché
        ne peut pas atteindre son comptoir. Le numéro saisi ici n'est plus jamais rendu à
        l'écran. Pour corriger un numéro erroné, suspendez la ligne fautive puis
        inscrivez-en une nouvelle : réinscrire le même commerce créerait un second
        bénéficiaire portant le même nom.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <div>
          <Label className="text-xs">Nom du commerce</Label>
          <Input
            value={nouveau.nom}
            onChange={(e) => setNouveau({ ...nouveau, nom: e.target.value })}
            placeholder="Ex : Prosuma Cocody"
          />
        </div>
        <div>
          <Label className="text-xs">Ville</Label>
          <Input
            value={nouveau.ville}
            onChange={(e) => setNouveau({ ...nouveau, ville: e.target.value })}
            placeholder="Abidjan"
          />
        </div>
        <div>
          <Label className="text-xs">Moyen</Label>
          <Select
            value={nouveau.moyen}
            onValueChange={(v) => setNouveau({ ...nouveau, moyen: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MOYENS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Numéro d'encaissement</Label>
          <Input
            value={nouveau.numero}
            onChange={(e) => setNouveau({ ...nouveau, numero: e.target.value })}
            placeholder="0700000000"
          />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void enregistrer(true)} disabled={enCours}>
          {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
          Inscrire et vérifier
        </Button>
        <Button size="sm" variant="outline" onClick={() => void enregistrer(false)} disabled={enCours}>
          Inscrire sans vérifier
        </Button>
      </div>

      <ul className="mt-4 space-y-2">
        {marchands.map((m) => (
          <li
            key={m.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">
                {m.nom}
                {!m.actif && (
                  <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    suspendu
                  </span>
                )}
                {!m.verifie_le && (
                  <span className="ml-2 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                    non vérifié
                  </span>
                )}
                {!m.user_id && (
                  <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                    sans compte
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">
                {m.ville ?? "ville non renseignée"} ·{" "}
                {MOYENS.find((x) => x.value === m.moyen)?.label ?? m.moyen}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={enCours}
                onClick={() => void rattacher(m)}
              >
                {m.user_id ? "Changer le gérant" : "Rattacher un compte"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={enCours}
                onClick={() => void basculer(m)}
              >
                {m.actif ? "Suspendre" : "Réactiver"}
              </Button>
            </div>
          </li>
        ))}
        {marchands.length === 0 && (
          <li className="text-xs text-muted-foreground">
            Aucun marchand inscrit. Tant qu'il n'y en a pas, le paiement au comptoir ne peut
            pas aboutir.
          </li>
        )}
      </ul>
    </section>
  );
}

export default MerchantsEditor;
