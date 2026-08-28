import { useCallback, useEffect, useState } from "react";
import { Loader2, ToggleLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { FUND_MODES } from "@/modules/errands/pricing";

interface Mode {
  code: string;
  libelle: string;
  emoji: string;
  exemple: string;
  actif: boolean;
  modes_financement: string[];
  exige_panier_valide: boolean;
  position: number;
}

interface Fermeture {
  mode_code: string;
  city_slug: string;
  actif: boolean;
}

interface Ville {
  slug: string;
  name: string;
}

/**
 * Ouvrir et fermer les types de course.
 *
 * Le catalogue vivait dans une constante du code. Fermer le gaz le temps d'une
 * pénurie, ou le marché pendant des travaux, demandait une livraison de
 * l'application : personne ne le faisait, et la course partait quand même vers
 * un commerce fermé.
 *
 * Trois réglages par service, et ils ne servent pas la même chose.
 *
 * L'ouverture ferme le service partout. La fermeture par ville le ferme là où
 * aucun shopper ne le tient encore, sans le retirer d'Abidjan. Les règlements
 * autorisés disent comment l'achat se finance : un retrait de colis n'a rien à
 * acheter, lui proposer une avance ferait poser au client une question sans
 * objet.
 *
 * Ce qui est réglé ici est appliqué par la base, pas seulement par l'écran :
 * une course publiée par un appel direct dans une catégorie fermée est refusée.
 */
export function ServiceModesEditor() {
  const [modes, setModes] = useState<Mode[]>([]);
  const [fermetures, setFermetures] = useState<Fermeture[]>([]);
  const [villes, setVilles] = useState<Ville[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const [m, f, v] = await Promise.all([
      supabase.from("service_modes").select("*").order("position"),
      supabase.from("service_mode_cities").select("mode_code, city_slug, actif"),
      supabase.from("service_cities").select("slug, name").order("name"),
    ]);
    setModes((m.data ?? []) as Mode[]);
    setFermetures((f.data ?? []) as Fermeture[]);
    setVilles((v.data ?? []) as Ville[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const fermeesDe = (code: string) =>
    fermetures.filter((x) => x.mode_code === code && !x.actif).map((x) => x.city_slug);

  const regler = async (
    mode: Mode,
    changement: {
      actif?: boolean;
      modes_financement?: string[];
      exige_panier?: boolean;
      villes_fermees?: string[];
    }
  ) => {
    setEnCours(mode.code);
    const { error } = await supabase.rpc("service_mode_regler", {
      p_code: mode.code,
      p_actif: changement.actif ?? mode.actif,
      p_modes_financement: changement.modes_financement ?? null,
      p_exige_panier: changement.exige_panier ?? null,
      // La liste remplace la précédente : c'est un état, pas une suite
      // d'ajouts. On renvoie donc toujours la liste complète.
      p_villes_fermees: changement.villes_fermees ?? fermeesDe(mode.code),
    });
    setEnCours(null);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Le service « ${mode.libelle} » est enregistré.`);
    await charger();
  };

  const basculerReglement = (mode: Mode, valeur: string) => {
    const actuels = mode.modes_financement ?? [];
    const suivants = actuels.includes(valeur)
      ? actuels.filter((x) => x !== valeur)
      : [...actuels, valeur];
    if (suivants.length === 0) {
      // Un service sans aucun règlement ne pourrait plus recevoir de course,
      // sans que rien à l'écran ne dise pourquoi. Le fermer est plus honnête.
      toast.error("Gardez au moins un règlement, ou fermez le service.");
      return;
    }
    void regler(mode, { modes_financement: suivants });
  };

  const basculerVille = (mode: Mode, slug: string) => {
    const fermees = fermeesDe(mode.code);
    const suivantes = fermees.includes(slug)
      ? fermees.filter((x) => x !== slug)
      : [...fermees, slug];
    void regler(mode, { villes_fermees: suivantes });
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
        <ToggleLeft className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Types de course ouverts</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Fermer un service le retire du formulaire et fait refuser toute course de cette
        catégorie par la base, y compris envoyée hors de l'écran.
      </p>

      <ul className="mt-4 space-y-3">
        {modes.map((mode) => {
          const fermees = fermeesDe(mode.code);
          const occupe = enCours === mode.code;
          return (
            <li key={mode.code} className="rounded-xl border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    <span aria-hidden="true">{mode.emoji}</span> {mode.libelle}
                    {!mode.actif && (
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        fermé
                      </span>
                    )}
                    {mode.actif && fermees.length > 0 && (
                      <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
                        fermé dans {fermees.length} ville{fermees.length > 1 ? "s" : ""}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{mode.exemple}</p>
                </div>
                <Button
                  size="sm"
                  variant={mode.actif ? "outline" : "default"}
                  disabled={occupe}
                  onClick={() => void regler(mode, { actif: !mode.actif })}
                >
                  {occupe && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
                  {mode.actif ? "Fermer" : "Ouvrir"}
                </Button>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Règlements autorisés</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {FUND_MODES.map((f) => {
                      const choisi = (mode.modes_financement ?? []).includes(f.value);
                      return (
                        <button
                          key={f.value}
                          type="button"
                          disabled={occupe}
                          onClick={() => basculerReglement(mode, f.value)}
                          aria-pressed={choisi}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            choisi
                              ? "border-primary bg-primary-soft text-primary"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {f.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Villes où ce service est fermé</Label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {villes.map((v) => {
                      const fermee = fermees.includes(v.slug);
                      return (
                        <button
                          key={v.slug}
                          type="button"
                          disabled={occupe}
                          onClick={() => basculerVille(mode, v.slug)}
                          aria-pressed={fermee}
                          className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                            fermee
                              ? "border-destructive/50 bg-destructive/10 text-destructive"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {v.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={mode.exige_panier_valide}
                  disabled={occupe}
                  onChange={(e) => void regler(mode, { exige_panier: e.target.checked })}
                />
                Exiger la validation du panier par le client avant l'achat
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default ServiceModesEditor;
