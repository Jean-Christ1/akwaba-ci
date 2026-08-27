import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { PricingGridEditor } from "@/modules/admin/PricingGridEditor";
import { HelpArticlesEditor } from "@/modules/admin/HelpArticlesEditor";
import { PromoCodesEditor } from "@/modules/admin/PromoCodesEditor";
import { formatFcfa } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Bareme {
  version: number;
  settlement: string;
  base: string;
  rate: number;
  min_service_fee: number;
  min_payout: number;
  hold_hours: number;
  overtime_grace_minutes: number;
  overtime_per_minute: number;
  distance_grace_km: number;
  distance_per_km: number;
  overrun_cap_ratio: number;
  budget_tolerance_pct: number;
  budget_tolerance_min: number;
}

interface Fournisseur {
  code: string;
  label: string;
  is_enabled: boolean;
  secret_name: string | null;
  merchant_number: string | null;
  merchant_name: string | null;
  instructions: string | null;
  fee_percent: number;
  fee_fixed: number;
}

interface Ville {
  slug: string;
  name: string;
  is_active: boolean;
  errands_enabled: boolean;
}

/**
 * Paramètres du service.
 *
 * Tout ce qui se réglait jusqu'ici en modifiant du code : le barème, les villes
 * ouvertes, les moyens de paiement. Publier un barème crée une version et
 * désactive la précédente, si bien que chaque course passée garde la trace de
 * celui qui lui était appliqué.
 */
export default function SettingsPage() {
  usePageTitle("Paramètres du service", "Barème, zones couvertes et moyens de paiement.");

  const { isAdmin, loading } = useAuth();
  const [bareme, setBareme] = useState<Bareme | null>(null);
  const [brouillon, setBrouillon] = useState<Bareme | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [villes, setVilles] = useState<Ville[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, f, v] = await Promise.all([
      supabase
        .from("commission_rules")
        .select(
          "version,rate,settlement,base,min_service_fee,min_payout,hold_hours,overtime_grace_minutes,overtime_per_minute,distance_grace_km,distance_per_km,overrun_cap_ratio,budget_tolerance_pct,budget_tolerance_min"
        )
        .eq("is_active", true)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("payment_providers")
        .select(
          "code,label,is_enabled,secret_name,merchant_number,merchant_name,instructions,fee_percent,fee_fixed"
        )
        .order("position"),
      supabase
        .from("service_cities")
        .select("slug,name,is_active,errands_enabled")
        .order("position"),
    ]);

    if (b.data) {
      setBareme(b.data as Bareme);
      setBrouillon(b.data as Bareme);
    }
    setFournisseurs((f.data ?? []) as Fournisseur[]);
    setVilles((v.data ?? []) as Ville[]);
  }, []);

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin, load]);

  const publierBareme = async () => {
    if (!brouillon) return;
    if (!window.confirm("Publier ce barème ? Il s'appliquera aux nouvelles courses.")) return;

    setBusy(true);
    const { error } = await supabase.rpc("commission_rule_publish", {
      p_rate: brouillon.rate,
      p_min_service_fee: brouillon.min_service_fee,
      p_min_payout: brouillon.min_payout,
      p_hold_hours: brouillon.hold_hours,
      p_overtime_grace: brouillon.overtime_grace_minutes,
      p_overtime_per_min: brouillon.overtime_per_minute,
      p_distance_grace_km: brouillon.distance_grace_km,
      p_distance_per_km: brouillon.distance_per_km,
      p_overrun_cap_ratio: brouillon.overrun_cap_ratio,
      p_budget_tol_pct: brouillon.budget_tolerance_pct,
      p_budget_tol_min: brouillon.budget_tolerance_min,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success("Barème publié.");
    load();
  };

  const majFournisseur = async (code: string, champs: Partial<Fournisseur>) => {
    const { error } = await supabase
      .from("payment_providers")
      .update({ ...champs, updated_at: new Date().toISOString() })
      .eq("code", code);

    if (error) return toast.error(error.message);
    await supabase.rpc("log_audit", {
      p_action: "update",
      p_entity: "payment_provider",
      p_entity_id: code,
      p_details: champs as never,
    });
    load();
  };

  const majVille = async (slug: string, champs: Partial<Ville>) => {
    const { error } = await supabase.from("service_cities").update(champs).eq("slug", slug);
    if (error) return toast.error(error.message);
    toast.success("Zone mise à jour.");
    load();
  };

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Accès réservé aux administrateurs.{" "}
        <Link className="text-primary" to="/profil">
          Mon profil
        </Link>
      </div>
    );
  }

  const champ = (
    cle: keyof Bareme,
    libelle: string,
    aide: string,
    pas = "1"
  ) => (
    <div>
      <Label className="text-xs" htmlFor={String(cle)}>
        {libelle}
      </Label>
      <Input
        id={String(cle)}
        type="number"
        step={pas}
        className="mt-1"
        value={brouillon?.[cle] ?? 0}
        onChange={(e) =>
          setBrouillon((b) => (b ? { ...b, [cle]: Number(e.target.value) } : b))
        }
      />
      <p className="mt-1 text-[11px] text-muted-foreground">{aide}</p>
    </div>
  );

  return (
    <div className="akw-container max-w-4xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Paramètres du service</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Ce qui se réglait auparavant en modifiant le code. Chaque publication de barème est
        versionnée et tracée.
      </p>

      {/* Barème */}
      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Barème</h2>
          {bareme && (
            <span className="rounded-full bg-muted px-3 py-1 text-xs">
              version {bareme.version} en vigueur
            </span>
          )}
        </div>

        {/* Le mode de règlement décide qui détient l'argent, et le portefeuille
            du shopper comme la page « Comment ça marche » en dépendent. Il
            n'était affiché nulle part : un exploitant ne pouvait pas savoir ce
            que sa plateforme applique. Il est montré, pas modifiable ici :
            passer au séquestre suppose un prestataire de paiement, qui n'est
            pas choisi, et offrir l'interrupteur promettrait ce qui n'existe
            pas. La publication d'un barème le conserve désormais. */}
        {bareme && (
          <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">
              Règlement :{" "}
              {bareme.settlement === "direct"
                ? "direct, le client paie le shopper lui-même"
                : "séquestre, la plateforme détient les fonds jusqu'à la clôture"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Assiette de la commission :{" "}
              {bareme.base === "service_and_delivery"
                ? "frais de service et livraison"
                : "frais de service seuls"}
              . Ces deux réglages sont repris à chaque publication de barème ; les changer
              suppose une décision d'entreprise, pas un simple champ.
            </p>
          </div>
        )}

        {brouillon && (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {champ("rate", "Taux de commission", "Part prélevée sur le frais de service, entre 0 et 0,5.", "0.01")}
              {champ("min_service_fee", "Frais de service plancher", "Aucune course n'est facturée en dessous.")}
              {champ("min_payout", "Retrait minimum", "Montant en dessous duquel un retrait est refusé.")}
              {champ("hold_hours", "Délai anti-litige (heures)", "Durée avant qu'un gain devienne disponible.")}
              {champ("overtime_grace_minutes", "Tolérance de temps (min)", "Minutes de dépassement offertes.")}
              {champ("overtime_per_minute", "Prix de la minute", "Facturé au delà de la tolérance.")}
              {champ("distance_grace_km", "Tolérance de distance (km)", "Kilomètres de dépassement offerts.", "0.5")}
              {champ("distance_per_km", "Prix du kilomètre", "Facturé au delà de la tolérance.")}
              {champ("overrun_cap_ratio", "Plafond du supplément", "Part du frais de service, 0,5 pour la moitié.", "0.05")}
              {champ("budget_tolerance_pct", "Tolérance de budget (%)", "Écart d'achat accepté sans accord.", "1")}
              {champ("budget_tolerance_min", "Tolérance plancher", "Écart toujours accepté, en francs.")}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Button disabled={busy} onClick={publierBareme}>
                Publier ce barème
              </Button>
              <Button variant="outline" onClick={() => setBrouillon(bareme)}>
                Annuler mes modifications
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Publier crée une nouvelle version. Les courses en cours conservent le barème sous
              lequel elles ont été acceptées.
            </p>
          </>
        )}
      </section>

      {/* Moyens de paiement */}
      <PricingGridEditor />

      <PromoCodesEditor />

      <HelpArticlesEditor />

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Moyens de paiement</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Les clés d'un prestataire ne sont jamais stockées ici : on renseigne le nom du secret
          Supabase qui les porte. Une clé inscrite dans cette table partirait dans le navigateur.
        </p>

        <div className="mt-4 space-y-3">
          {fournisseurs.map((f) => (
            <div key={f.code} className="rounded-xl border border-border bg-background p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{f.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {f.is_enabled ? "Proposé aux clients" : "Masqué"}
                    {f.fee_percent > 0 || f.fee_fixed > 0
                      ? ` · frais ${f.fee_percent}% + ${formatFcfa(f.fee_fixed)}`
                      : ""}
                  </p>
                </div>
                <Switch
                  checked={f.is_enabled}
                  onCheckedChange={(v) => majFournisseur(f.code, { is_enabled: v })}
                  aria-label={`Activer ${f.label}`}
                />
              </div>

              {f.is_enabled && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs" htmlFor={`num-${f.code}`}>
                      Numéro marchand
                    </Label>
                    <Input
                      id={`num-${f.code}`}
                      className="mt-1"
                      type="tel"
                      inputMode="tel"
                      defaultValue={f.merchant_number ?? ""}
                      onBlur={(e) => majFournisseur(f.code, { merchant_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`nom-${f.code}`}>
                      Nom du compte
                    </Label>
                    <Input
                      id={`nom-${f.code}`}
                      className="mt-1"
                      defaultValue={f.merchant_name ?? ""}
                      onBlur={(e) => majFournisseur(f.code, { merchant_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs" htmlFor={`sec-${f.code}`}>
                      Nom du secret Supabase
                    </Label>
                    <Input
                      id={`sec-${f.code}`}
                      className="mt-1"
                      placeholder="WAVE_API_KEY"
                      defaultValue={f.secret_name ?? ""}
                      onBlur={(e) => majFournisseur(f.code, { secret_name: e.target.value })}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      La clé se dépose dans les secrets Supabase, pas ici.
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs" htmlFor={`ins-${f.code}`}>
                      Consigne affichée au client
                    </Label>
                    <Textarea
                      id={`ins-${f.code}`}
                      rows={2}
                      className="mt-1"
                      defaultValue={f.instructions ?? ""}
                      onBlur={(e) => majFournisseur(f.code, { instructions: e.target.value })}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Zones couvertes */}
      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Zones couvertes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Une ville n'est ouverte aux courses que si un réseau de shoppers y existe. L'ouvrir sans
          personne pour assurer le service revient à promettre ce qu'on ne peut pas tenir.
        </p>

        <div className="mt-3 space-y-2">
          {villes.map((v) => (
            <div
              key={v.slug}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background p-3"
            >
              <p className="font-medium">{v.name}</p>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={v.is_active}
                    onCheckedChange={(c) => majVille(v.slug, { is_active: c })}
                    aria-label={`Afficher ${v.name}`}
                  />
                  Visible
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={v.errands_enabled}
                    onCheckedChange={(c) => majVille(v.slug, { errands_enabled: c })}
                    aria-label={`Ouvrir les courses à ${v.name}`}
                  />
                  Courses
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
