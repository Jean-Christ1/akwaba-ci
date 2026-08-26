import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { lireGrille, type GrilleTarifaire } from "@/modules/errands/grilleTarifaire";
import { VEHICLE_OPTIONS, VOLUME_OPTIONS, URGENCY_OPTIONS } from "@/modules/errands/pricing";

/**
 * Le barème des courses, modifiable depuis la console.
 *
 * Relever le prix au kilomètre demandait auparavant de modifier du TypeScript,
 * de modifier du PL/pgSQL, de reconstruire l'application et de la redéployer.
 * Un tarif qu'on ne peut pas changer sans développeur n'est pas un tarif.
 *
 * Un barème ne se modifie pas : il se republie. La version en cours est figée,
 * une nouvelle prend la suite, et les courses déjà publiées gardent celle qui
 * leur a été appliquée. Corriger une ligne en place réécrirait le prix de
 * courses déjà engagées, parfois déjà livrées.
 */
export function PricingGridEditor() {
  const [grille, setGrille] = useState<GrilleTarifaire | null>(null);
  const [brouillon, setBrouillon] = useState<GrilleTarifaire | null>(null);
  const [intitule, setIntitule] = useState("");
  const [villes, setVilles] = useState<{ slug: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);

  const charger = async () => {
    const [{ data: g }, { data: v }] = await Promise.all([
      supabase.rpc("active_pricing_grid"),
      supabase.from("service_cities").select("slug,name").order("name"),
    ]);
    const lue = lireGrille(g);
    setGrille(lue);
    setBrouillon(lue);
    setVilles(v ?? []);
  };

  useEffect(() => {
    void charger();
  }, []);

  const publier = async () => {
    if (!brouillon) return;
    if (intitule.trim().length < 3) {
      return toast.error("Donnez un intitulé au barème : il sert à le reconnaître plus tard.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("pricing_publish", {
      p_label: intitule.trim(),
      p_scalaires: {
        freeMinutes: brouillon.freeMinutes,
        perMinute: brouillon.perMinute,
        itemsIncluded: brouillon.itemsIncluded,
        perExtraItem: brouillon.perExtraItem,
        roundingStep: brouillon.roundingStep,
        volume: brouillon.volume,
        urgency: brouillon.urgency,
        dropoff: brouillon.dropoff,
      },
      // Le type Json genere ne reconnait pas un Record d'objets ; la
      // serialisation est la meme, seule la declaration differe.
      p_vehicules: brouillon.vehicles as unknown as Json,
      p_villes: brouillon.cities as unknown as Json,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Barème publié. Les prochaines courses l'appliquent.");
    setIntitule("");
    void charger();
  };

  if (!brouillon) {
    return (
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Barème des courses</h2>
        <p className="mt-2 text-sm text-muted-foreground">Chargement du barème…</p>
      </section>
    );
  }

  const nombre = (
    valeur: number,
    onChange: (n: number) => void,
    libelle: string,
    pas = "1"
  ) => (
    <div>
      <Label className="text-xs">{libelle}</Label>
      <Input
        type="number"
        step={pas}
        className="mt-1 min-h-[44px]"
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Barème des courses</h2>
        <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs text-primary">
          version {grille?.version} · {grille?.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Ce qui se réglait en modifiant le code. Publier crée une version : les courses déjà
        publiées gardent la leur, y compris si elles sont contestées plus tard.
      </p>

      <h3 className="mt-4 text-sm font-semibold">Prise en charge et kilomètre, par véhicule</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {VEHICLE_OPTIONS.map((v) => {
          const t = brouillon.vehicles[v.value] ?? { base: 0, perKm: 0 };
          const maj = (champ: "base" | "perKm") => (n: number) =>
            setBrouillon((b) =>
              b ? { ...b, vehicles: { ...b.vehicles, [v.value]: { ...t, [champ]: n } } } : b
            );
          return (
            <div key={v.value} className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">{v.label}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {nombre(t.base, maj("base"), "Prise en charge", "50")}
                {nombre(t.perKm, maj("perKm"), "Par km", "10")}
              </div>
            </div>
          );
        })}
      </div>

      <h3 className="mt-4 text-sm font-semibold">Temps, panier et arrondi</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nombre(
          brouillon.freeMinutes,
          (n) => setBrouillon((b) => b && { ...b, freeMinutes: n }),
          "Minutes comprises"
        )}
        {nombre(
          brouillon.perMinute,
          (n) => setBrouillon((b) => b && { ...b, perMinute: n }),
          "FCFA par minute au-delà"
        )}
        {nombre(
          brouillon.itemsIncluded,
          (n) => setBrouillon((b) => b && { ...b, itemsIncluded: n }),
          "Articles compris"
        )}
        {nombre(
          brouillon.perExtraItem,
          (n) => setBrouillon((b) => b && { ...b, perExtraItem: n }),
          "FCFA par article en plus"
        )}
        {nombre(
          brouillon.roundingStep,
          (n) => setBrouillon((b) => b && { ...b, roundingStep: n }),
          "Pas d'arrondi",
          "10"
        )}
      </div>

      <h3 className="mt-4 text-sm font-semibold">Volume et urgence</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {VOLUME_OPTIONS.map((o) =>
          nombre(
            brouillon.volume[o.value] ?? 0,
            (n) => setBrouillon((b) => b && { ...b, volume: { ...b.volume, [o.value]: n } }),
            "Volume : " + o.label,
            "50"
          )
        )}
        {URGENCY_OPTIONS.map((o) =>
          nombre(
            brouillon.urgency[o.value] ?? 0,
            (n) => setBrouillon((b) => b && { ...b, urgency: { ...b.urgency, [o.value]: n } }),
            "Urgence : " + o.label,
            "50"
          )
        )}
      </div>

      <h3 className="mt-4 text-sm font-semibold">Coefficients par ville</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Une course de cinq kilomètres n'a pas le même coût à Abidjan et à Korhogo. Le coefficient 1
        applique le barème tel quel. Une ville absente de cette liste reste chiffrable au tarif
        neutre.
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {villes.map((ville) => {
          const t = brouillon.cities[ville.slug] ?? {
            baseMultiplier: 1,
            perKmMultiplier: 1,
            minServiceFee: null,
          };
          const maj = (champ: "baseMultiplier" | "perKmMultiplier") => (n: number) =>
            setBrouillon((b) =>
              b ? { ...b, cities: { ...b.cities, [ville.slug]: { ...t, [champ]: n } } } : b
            );
          return (
            <div key={ville.slug} className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">{ville.name}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {nombre(t.baseMultiplier, maj("baseMultiplier"), "Coefficient prise en charge", "0.05")}
                {nombre(t.perKmMultiplier, maj("perKmMultiplier"), "Coefficient kilomètre", "0.05")}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <Label className="text-xs" htmlFor="intitule-bareme">
          Intitulé de cette version
        </Label>
        <Input
          id="intitule-bareme"
          className="mt-1 min-h-[44px]"
          placeholder="Hausse carburant, août 2026"
          value={intitule}
          onChange={(e) => setIntitule(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Il apparaîtra dans le journal d'audit et sur chaque course chiffrée avec ce barème.
        </p>
        <Button className="mt-3 min-h-[44px]" disabled={busy} onClick={() => void publier()}>
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Publier ce barème
        </Button>
      </div>
    </section>
  );
}

export default PricingGridEditor;
