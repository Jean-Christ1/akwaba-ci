import { useCallback, useEffect, useState } from "react";
import { BadgePercent, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa } from "@/modules/errands/domain";
import { normaliserCode } from "@/modules/errands/ui/PromoCodeField";

interface Code {
  code: string;
  libelle: string;
  type: string;
  valeur: number;
  remise_max: number | null;
  frais_minimum: number;
  ville_slug: string | null;
  fin: string | null;
  usages_max: number | null;
  usages_par_personne: number;
  actif: boolean;
}

interface Usage {
  code: string;
  remise: number;
}

const NEUF: Code = {
  code: "",
  libelle: "",
  type: "fixed",
  valeur: 500,
  remise_max: null,
  frais_minimum: 0,
  ville_slug: null,
  fin: null,
  usages_max: null,
  usages_par_personne: 1,
  actif: true,
};

/**
 * Les codes promotionnels.
 *
 * Un point mérite d'être lu avant d'en créer un : la remise sort de la
 * commission d'Akwaba, jamais du gain du shopper. Un shopper n'a pas décidé de
 * la promotion, ne l'a pas annoncée, ne l'a même pas vue ; lui en faire porter
 * le coût réduirait son revenu pour une décision qui n'est pas la sienne, et
 * il n'en saurait rien.
 *
 * La conséquence pratique : une remise supérieure à la commission est
 * plafonnée, elle ne mord pas plus loin. Un code annoncé à 2 000 FCFA peut
 * n'en offrir que 300 sur une petite course, et l'écran du client le dit.
 */
export function PromoCodesEditor() {
  const [codes, setCodes] = useState<Code[]>([]);
  const [usages, setUsages] = useState<Usage[]>([]);
  const [villes, setVilles] = useState<{ slug: string; name: string }[]>([]);
  const [brouillon, setBrouillon] = useState<Code | null>(null);
  const [jePeux, setJePeux] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    const [{ data: c }, { data: u }, { data: v }, { data: droits }] = await Promise.all([
      supabase.from("promo_codes").select("*").order("code"),
      supabase.from("promo_redemptions").select("code,remise"),
      supabase.from("service_cities").select("slug,name").order("name"),
      supabase.rpc("my_permissions"),
    ]);
    setCodes((c ?? []) as Code[]);
    setUsages((u ?? []) as Usage[]);
    setVilles(v ?? []);
    setJePeux(((droits as string[]) ?? []).includes("promotions.gerer"));
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const bilan = (code: string) => {
    const siens = usages.filter((u) => u.code === code);
    return {
      nombre: siens.length,
      total: siens.reduce((somme, u) => somme + Number(u.remise), 0),
    };
  };

  const publier = async () => {
    if (!brouillon) return;
    const code = normaliserCode(brouillon.code);
    if (!/^[A-Z0-9-]{3,24}$/.test(code)) {
      return toast.error(
        "Un code ne contient que des majuscules, des chiffres et des tirets, de trois à vingt-quatre caractères."
      );
    }
    if (brouillon.libelle.trim().length < 3) {
      return toast.error("Donnez un intitulé au code : il apparaît au client quand il l'applique.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("promo_publier", {
      p_code: code,
      p_libelle: brouillon.libelle.trim(),
      p_type: brouillon.type,
      p_valeur: brouillon.valeur,
      p_remise_max: brouillon.remise_max,
      p_frais_minimum: brouillon.frais_minimum,
      p_ville_slug: brouillon.ville_slug,
      p_fin: brouillon.fin,
      p_usages_max: brouillon.usages_max,
      p_usages_par_personne: brouillon.usages_par_personne,
      p_actif: brouillon.actif,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Code publié.");
    setBrouillon(null);
    void charger();
  };

  const basculer = async (c: Code) => {
    const { error } = await supabase.rpc("promo_publier", {
      p_code: c.code,
      p_libelle: c.libelle,
      p_type: c.type,
      p_valeur: c.valeur,
      p_remise_max: c.remise_max,
      p_frais_minimum: c.frais_minimum,
      p_ville_slug: c.ville_slug,
      p_fin: c.fin,
      p_usages_max: c.usages_max,
      p_usages_par_personne: c.usages_par_personne,
      p_actif: !c.actif,
    });
    if (error) return toast.error(error.message);
    toast.success(c.actif ? "Code suspendu." : "Code réactivé.");
    void charger();
  };

  if (chargement) return null;

  const nombre = (
    valeur: number | null,
    onChange: (n: number | null) => void,
    libelle: string,
    aide?: string,
    permetVide = false
  ) => (
    <div>
      <Label className="text-xs">{libelle}</Label>
      <Input
        type="number"
        className="mt-1 min-h-[44px]"
        value={valeur ?? ""}
        placeholder={permetVide ? "sans limite" : undefined}
        onChange={(e) =>
          onChange(e.target.value === "" ? (permetVide ? null : 0) : Number(e.target.value))
        }
      />
      {aide && <p className="mt-1 text-[11px] text-muted-foreground">{aide}</p>}
    </div>
  );

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
          <BadgePercent className="h-4 w-4 text-primary" aria-hidden="true" />
          Codes promotionnels
        </h2>
        <span className="text-xs text-muted-foreground">
          {codes.filter((c) => c.actif).length} actif(s) sur {codes.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        La remise sort de la commission d'Akwaba, jamais du gain du shopper. Une remise supérieure
        à la commission est donc plafonnée : le client reçoit ce que la commission permet, et pas
        davantage.
      </p>

      {!jePeux && (
        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Vous n'avez pas le droit de gérer les codes promotionnels.
        </p>
      )}

      <Button
        className="mt-4 min-h-[44px]"
        disabled={!jePeux}
        onClick={() => setBrouillon({ ...NEUF })}
      >
        Nouveau code
      </Button>

      {brouillon && (
        <div className="mt-4 rounded-2xl border border-primary/40 bg-primary-soft/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="promo-code">
                Code
              </Label>
              <Input
                id="promo-code"
                className="mt-1 min-h-[44px] font-mono uppercase"
                placeholder="PREMIERE-COURSE"
                value={brouillon.code}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, code: normaliserCode(e.target.value) })
                }
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="promo-libelle">
                Intitulé vu par le client
              </Label>
              <Input
                id="promo-libelle"
                className="mt-1 min-h-[44px]"
                placeholder="Votre première course offerte"
                value={brouillon.libelle}
                onChange={(e) => setBrouillon({ ...brouillon, libelle: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div>
              <Label className="text-xs" htmlFor="promo-type">
                Forme de la remise
              </Label>
              <select
                id="promo-type"
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={brouillon.type}
                onChange={(e) => setBrouillon({ ...brouillon, type: e.target.value })}
              >
                <option value="fixed">Montant en FCFA</option>
                <option value="percent">Part des frais de service</option>
              </select>
            </div>
            {nombre(
              brouillon.valeur,
              (n) => setBrouillon({ ...brouillon, valeur: n ?? 0 }),
              brouillon.type === "percent" ? "Pourcentage" : "Montant en FCFA"
            )}
            {nombre(
              brouillon.remise_max,
              (n) => setBrouillon({ ...brouillon, remise_max: n }),
              "Remise maximale",
              "Sans ce plafond, une longue course offre bien plus qu'une courte.",
              true
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {nombre(
              brouillon.frais_minimum,
              (n) => setBrouillon({ ...brouillon, frais_minimum: n ?? 0 }),
              "Frais de service minimum"
            )}
            {nombre(
              brouillon.usages_max,
              (n) => setBrouillon({ ...brouillon, usages_max: n }),
              "Utilisations au total",
              "Vide : promesse ouverte.",
              true
            )}
            {nombre(
              brouillon.usages_par_personne,
              (n) => setBrouillon({ ...brouillon, usages_par_personne: n ?? 1 }),
              "Par personne"
            )}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="promo-ville">
                Ville
              </Label>
              <select
                id="promo-ville"
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={brouillon.ville_slug ?? ""}
                onChange={(e) =>
                  setBrouillon({ ...brouillon, ville_slug: e.target.value || null })
                }
              >
                <option value="">Toutes les villes</option>
                {villes.map((v) => (
                  <option key={v.slug} value={v.slug}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label className="text-xs" htmlFor="promo-fin">
                Dernier jour
              </Label>
              <Input
                id="promo-fin"
                type="date"
                className="mt-1 min-h-[44px]"
                value={brouillon.fin?.slice(0, 10) ?? ""}
                onChange={(e) =>
                  setBrouillon({
                    ...brouillon,
                    fin: e.target.value ? new Date(e.target.value).toISOString() : null,
                  })
                }
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="min-h-[44px]" disabled={busy} onClick={() => void publier()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Publier ce code
            </Button>
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setBrouillon(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {codes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {codes.map((c) => {
            const b = bilan(c.code);
            return (
              <li key={c.code} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <code className="font-mono text-sm font-medium">{c.code}</code>
                      {!c.actif && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          suspendu
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {c.libelle} ·{" "}
                      {c.type === "percent" ? `${c.valeur} %` : formatFcfa(c.valeur)}
                      {c.ville_slug && ` · ${villes.find((v) => v.slug === c.ville_slug)?.name ?? c.ville_slug}`}
                      {c.usages_max !== null && ` · ${b.nombre}/${c.usages_max} utilisé(s)`}
                    </p>
                    {b.nombre > 0 && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {b.nombre} utilisation(s), {formatFcfa(b.total)} de commission cédée
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      disabled={!jePeux}
                      onClick={() => setBrouillon(c)}
                    >
                      Modifier
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px]"
                      disabled={!jePeux}
                      onClick={() => void basculer(c)}
                    >
                      {c.actif ? "Suspendre" : "Réactiver"}
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default PromoCodesEditor;
