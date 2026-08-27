import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { escapeHtml } from "../_shared/html.ts";

/**
 * Envoyeur des notifications déposées en base.
 *
 * La base dépose ce qu'il faut dire, cette fonction le porte. Le découplage est
 * volontaire : une panne de messagerie ne doit jamais empêcher de clôturer une
 * course, et un envoi raté doit pouvoir être rejoué sans rejouer le métier.
 *
 * Elle se déclenche par appel planifié. Sans clé d'envoi configurée, elle ne
 * feint pas de travailler : elle le dit et laisse la file intacte, pour que le
 * jour où la clé arrive, rien ne soit perdu.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Notification {
  id: string;
  /** Canal retenu au depot : whatsapp, sms, email ou in_app. */
  canal: string;
  /** Numero ou adresse retenu au depot, selon le canal. */
  destination: string | null;
  email: string | null;
  subject: string;
  body: string;
  event: string;
}

const gabarit = (sujet: string, corps: string): string => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8" /></head>
<body style="margin:0;background:#faf7f2;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"
             style="max-width:520px;background:#ffffff;border-radius:16px;padding:28px;">
        <tr><td style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b45309;">Akwaba</td></tr>
        <tr><td style="padding-top:8px;font-size:19px;font-weight:600;color:#1c1917;">${escapeHtml(sujet)}</td></tr>
        <tr><td style="padding-top:14px;font-size:15px;line-height:1.6;color:#44403c;">${escapeHtml(corps)}</td></tr>
        <tr><td style="padding-top:24px;font-size:12px;color:#a8a29e;">
          Vous recevez ce message parce que vous participez à une course sur Akwaba.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const reponse = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const EXPEDITEUR = Deno.env.get("NOTIFICATION_FROM");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return reponse({ error: "Configuration Supabase absente." }, 500);
    }

    // Un envoyeur ouvert à tous permettrait de vider la file à la demande, donc
    // d'inonder les destinataires. L'appel est authentifié quand un secret est
    // configuré ; sans secret configuré, la fonction refuse plutôt que de
    // s'ouvrir par défaut.
    if (!CRON_SECRET) {
      return reponse({ error: "CRON_SECRET non configuré, envoi refusé." }, 503);
    }
    const fourni = req.headers.get("x-cron-secret") ?? "";
    if (fourni.length !== CRON_SECRET.length || fourni !== CRON_SECRET) {
      return reponse({ error: "Appel non autorisé." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Fournisseurs des autres canaux. Aucun n'est contractualisé à ce jour :
    // les variables sont lues plutôt que devinées, et leur absence est dite,
    // jamais contournée par un envoi de substitution silencieux.
    const WHATSAPP_URL = Deno.env.get("WHATSAPP_API_URL");
    const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_API_TOKEN");
    const SMS_URL = Deno.env.get("SMS_API_URL");
    const SMS_TOKEN = Deno.env.get("SMS_API_TOKEN");

    // Sans moyen d'envoi, on ne consomme pas la file : la laisser intacte
    // permet de tout expédier le jour où la clé est renseignée, plutôt que de
    // perdre silencieusement les messages de la période sans configuration.
    if (!RESEND || !EXPEDITEUR) {
      const { count } = await admin
        .from("notification_outbox")
        .select("id", { count: "exact", head: true })
        .eq("state", "pending");

      return reponse({
        envoyees: 0,
        en_attente: count ?? 0,
        detail:
          "RESEND_API_KEY ou NOTIFICATION_FROM absent : la file est conservée, aucun message n'est perdu.",
      });
    }

    // Le porteur declare ce qu'il sait porter. La file ne lui remet rien
    // d'autre : un canal sans fournisseur attend au lieu de bruler ses
    // tentatives, et un porteur plus ancien ne recoit que du courriel.
    const canaux = ["email"];
    if (WHATSAPP_URL && WHATSAPP_TOKEN) canaux.push("whatsapp");
    if (SMS_URL && SMS_TOKEN) canaux.push("sms");
    // « in_app » n'a rien a porter : la personne le lit dans l'application.
    // Le reclamer sert seulement a le marquer remis.
    canaux.push("in_app");

    const { data, error } = await admin.rpc("notify_claim_batch", {
      p_limit: 25,
      p_canaux: canaux,
    });
    if (error) return reponse({ error: error.message }, 500);

    const lot = (data ?? []) as Notification[];
    let envoyees = 0;
    let echouees = 0;

    /**
     * Porte un message par le canal retenu au depot.
     *
     * Chaque canal a son fournisseur, et aucun ne se substitue a un autre en
     * silence : un message WhatsApp qu'on enverrait par courriel arriverait
     * ailleurs que la ou la personne l'attend, et personne ne le saurait.
     */
    const porter = async (n: Notification): Promise<Response> => {
      if (n.canal === "in_app") {
        // Rien a porter : la personne le verra en ouvrant l'application. Le
        // message est deja en base, c'est la son support.
        return new Response(null, { status: 204 });
      }

      if (n.canal === "whatsapp") {
        if (!WHATSAPP_URL || !WHATSAPP_TOKEN) {
          // Aucun fournisseur configure. On ne bascule pas sur le courriel :
          // le routage a deja tranche, et le refaire ici masquerait le manque.
          return new Response("WHATSAPP_API_URL ou WHATSAPP_API_TOKEN absent", { status: 503 });
        }
        return fetch(WHATSAPP_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: n.destination,
            type: "text",
            text: { body: `${n.subject}

${n.body}` },
          }),
        });
      }

      if (n.canal === "sms") {
        if (!SMS_URL || !SMS_TOKEN) {
          return new Response("SMS_API_URL ou SMS_API_TOKEN absent", { status: 503 });
        }
        return fetch(SMS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${SMS_TOKEN}`,
            "Content-Type": "application/json",
          },
          // Un SMS coute au caractere : le sujet suffit, le detail se lit dans
          // l'application.
          body: JSON.stringify({ to: n.destination, message: n.subject }),
        });
      }

      const adresse = n.destination ?? n.email;
      if (!adresse) return new Response("aucune adresse", { status: 422 });

      return fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RESEND}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: EXPEDITEUR,
          to: [adresse],
          subject: n.subject,
          html: gabarit(n.subject, n.body),
        }),
      });
    };

    let reportees = 0;

    for (const n of lot) {
      try {
        const envoi = await porter(n);

        // 503 veut dire « le canal n'a pas de fournisseur ». Ce n'est pas un
        // echec du message : on le remet en attente pour qu'il parte le jour
        // ou le contrat existe, au lieu de le bruler en cinq tentatives.
        if (envoi.status === 503) {
          const detail = await envoi.text();
          await admin.rpc("notify_mark", {
            p_id: n.id,
            p_state: "pending",
            p_error: `canal ${n.canal} sans fournisseur : ${detail.slice(0, 150)}`,
          });
          reportees++;
          continue;
        }

        if (envoi.ok || envoi.status === 204) {
          await admin.rpc("notify_mark", { p_id: n.id, p_state: "sent" });
          envoyees++;
        } else {
          const detail = await envoi.text();
          await admin.rpc("notify_mark", {
            p_id: n.id,
            p_state: "failed",
            p_error: `HTTP ${envoi.status} ${detail.slice(0, 200)}`,
          });
          echouees++;
        }
      } catch (e) {
        await admin.rpc("notify_mark", {
          p_id: n.id,
          p_state: "failed",
          p_error: e instanceof Error ? e.message : "erreur inconnue",
        });
        echouees++;
      }
    }

    return reponse({ reclamees: lot.length, envoyees, echouees, reportees });
  } catch (e) {
    // Le message technique reste dans les journaux de la fonction : le rendre
    // au client renseignerait un attaquant sur l'infrastructure.
    console.error("send-notifications", e);
    return reponse({ error: "Envoi impossible." }, 500);
  }
});
