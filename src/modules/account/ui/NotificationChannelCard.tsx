import { useEffect, useState } from "react";
import { Bell, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";

export type CanalPrefere = "whatsapp" | "sms" | "email" | "in_app";

const CANAUX: { value: CanalPrefere; label: string; aide: string }[] = [
  { value: "whatsapp", label: "WhatsApp", aide: "Le plus courant en Côte d'Ivoire" },
  { value: "sms", label: "SMS", aide: "Fonctionne sans connexion internet" },
  { value: "email", label: "Courriel", aide: "Utile pour garder une trace écrite" },
  { value: "in_app", label: "Dans l'application", aide: "Aucun message envoyé au dehors" },
];

/**
 * Dit si un numéro peut servir à joindre quelqu'un.
 *
 * Le serveur applique exactement la même règle : moins de huit chiffres, et le
 * numéro est traité comme absent. La reproduire ici évite d'enregistrer un
 * numéro que le routage écartera ensuite en silence.
 */
export function numeroJoignable(saisie: string): boolean {
  return saisie.replace(/\D/g, "").length >= 8;
}

interface NotificationChannelCardProps {
  /** Le téléphone du profil, qui sert de destination au SMS. */
  telephone: string;
}

/**
 * Où vous voulez être joint.
 *
 * Toutes les notifications partaient par courriel, et seulement par courriel.
 * En Côte d'Ivoire, WhatsApp est le canal courant ; beaucoup de comptes n'ont
 * pas d'adresse consultée. Un message envoyé là où personne ne regarde n'a pas
 * été envoyé, il a été perdu avec un accusé de succès.
 *
 * Le consentement est daté, pas coché : le jour où quelqu'un demande quand il a
 * accepté d'être joint sur WhatsApp, une case ne prouve rien.
 */
export function NotificationChannelCard({ telephone }: NotificationChannelCardProps) {
  const [canal, setCanal] = useState<CanalPrefere>("whatsapp");
  /**
   * Les canaux qui disposent d'un porteur en service.
   *
   * Deux des quatre n'en ont pas. Les proposer avec la même assurance que les
   * autres revient à laisser quelqu'un donner son numéro, dater son
   * consentement, et ne plus rien recevoir en croyant qu'on ne lui écrit pas.
   */
  const [portes, setPortes] = useState<string[] | null>(null);
  const [whatsapp, setWhatsapp] = useState("");
  const [whatsappOk, setWhatsappOk] = useState(false);
  const [smsOk, setSmsOk] = useState(false);
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let annule = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return setChargement(false);
      supabase
        .from("profiles")
        .select("canal_prefere,whatsapp,whatsapp_consent_at,sms_consent_at")
        .eq("id", data.user.id)
        .maybeSingle()
        .then(({ data: p }) => {
          if (annule) return;
          if (p) {
            setCanal((p.canal_prefere as CanalPrefere) ?? "whatsapp");
            setWhatsapp(p.whatsapp ?? "");
            setWhatsappOk(Boolean(p.whatsapp_consent_at));
            setSmsOk(Boolean(p.sms_consent_at));
          }
          setChargement(false);
        });
    });
    void supabase.rpc("canaux_portes").then(({ data }) => {
      if (!annule) setPortes((data as string[] | null) ?? []);
    });

    return () => {
      annule = true;
    };
  }, []);

  /** Tant que la réponse n'est pas là, on n'affirme rien. */
  const porte = (v: CanalPrefere) => portes === null || portes.includes(v);

  const enregistrer = async () => {
    if (canal === "whatsapp" && !whatsappOk) {
      return toast.error("Pour être joint sur WhatsApp, il faut accepter d'y recevoir nos messages.");
    }
    if (canal === "whatsapp" && !numeroJoignable(whatsapp)) {
      return toast.error("Indiquez un numéro WhatsApp complet.");
    }
    if (canal === "sms" && !numeroJoignable(telephone)) {
      return toast.error("Renseignez d'abord votre téléphone dans la fiche ci-dessus.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("notification_preferences_set", {
      p_canal_prefere: canal,
      p_whatsapp: whatsapp.trim() || null,
      p_whatsapp_ok: whatsappOk,
      p_sms_ok: smsOk,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    // Promettre un envoi sur un canal sans porteur serait exactement le
    // mensonge que cet ecran vient de cesser de faire.
    toast.success(
      porte(canal)
        ? "C'est enregistré. Vos prochains messages partiront par là."
        : "C'est enregistré. Ce canal n'est pas encore en service : retrouvez vos messages dans l'application."
    );
  };

  if (chargement) return null;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="font-display text-base font-semibold">Où vous joindre</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Le suivi de vos courses part par ce canal. Si nous n'arrivons pas à vous y joindre, nous
        essayons le suivant, et vous retrouvez toujours le message dans l'application.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {CANAUX.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setCanal(o.value)}
            aria-pressed={canal === o.value}
            className={`min-h-[44px] rounded-xl border px-3 py-2 text-left transition-colors ${
              canal === o.value
                ? "border-primary bg-primary-soft"
                : "border-border hover:border-primary/40"
            }`}
          >
            <span className="block text-sm font-medium">{o.label}</span>
            <span className="block text-[11px] text-muted-foreground">{o.aide}</span>
            {!porte(o.value) && (
              <span className="mt-0.5 block text-[11px] font-medium text-destructive">
                Pas encore en service : rien ne partirait par là.
              </span>
            )}
          </button>
        ))}
      </div>

      {!porte(canal) && (
        <p className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          Le canal que vous avez choisi n'est pas encore en service. Vos messages ne
          partiront pas par là. Choisissez-en un autre, ou retrouvez-les dans
          l'application.
        </p>
      )}

      <div className="mt-4">
        <Label className="text-xs" htmlFor="numero-whatsapp">
          Numéro WhatsApp
        </Label>
        <Input
          id="numero-whatsapp"
          className="mt-1 min-h-[44px]"
          inputMode="tel"
          placeholder="+225 07 00 00 00 00"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Souvent différent du numéro d'appel. C'est celui-là que nous utilisons.
        </p>
      </div>

      <div className="mt-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <Label className="text-sm font-normal" htmlFor="consentement-whatsapp">
            J'accepte de recevoir mes messages sur WhatsApp
          </Label>
          <Switch id="consentement-whatsapp" checked={whatsappOk} onCheckedChange={setWhatsappOk} />
        </div>
        <div className="flex items-start justify-between gap-3">
          <Label className="text-sm font-normal" htmlFor="consentement-sms">
            J'accepte de recevoir mes messages par SMS
          </Label>
          <Switch id="consentement-sms" checked={smsOk} onCheckedChange={setSmsOk} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Vous pouvez revenir sur ces choix à tout moment. Le suivi d'une course que vous avez
          engagée vous parviendra toujours, par le canal encore disponible.
        </p>
      </div>

      <Button className="mt-4 min-h-[44px]" disabled={busy} onClick={() => void enregistrer()}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        Enregistrer
      </Button>
    </section>
  );
}

export default NotificationChannelCard;
