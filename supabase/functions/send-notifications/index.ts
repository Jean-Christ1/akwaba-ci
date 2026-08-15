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
  email: string;
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

    const { data, error } = await admin.rpc("notify_claim_batch", { p_limit: 25 });
    if (error) return reponse({ error: error.message }, 500);

    const lot = (data ?? []) as Notification[];
    let envoyees = 0;
    let echouees = 0;

    for (const n of lot) {
      try {
        const envoi = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${RESEND}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: EXPEDITEUR,
            to: [n.email],
            subject: n.subject,
            html: gabarit(n.subject, n.body),
          }),
        });

        if (envoi.ok) {
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

    return reponse({ reclamees: lot.length, envoyees, echouees });
  } catch (e) {
    // Le message technique reste dans les journaux de la fonction : le rendre
    // au client renseignerait un attaquant sur l'infrastructure.
    console.error("send-notifications", e);
    return reponse({ error: "Envoi impossible." }, 500);
  }
});
