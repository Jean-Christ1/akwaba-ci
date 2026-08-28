import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { escapeHtml, safeOrigin } from "../_shared/html.ts";
import { SlidingWindowRateLimiter } from "../_shared/rate_limit.ts";
import { isEmail } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cette fonction envoie un courriel à une adresse libre. Un compte de
 * modération compromis en ferait un relais de messages : le nombre d'envois
 * par modérateur est donc plafonné.
 */
const SEND_WINDOW_MS = 10 * 60 * 1000;
const SEND_LIMIT = 5;

const sendLimiter = new SlidingWindowRateLimiter({ limit: SEND_LIMIT, windowMs: SEND_WINDOW_MS });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (m: string, x?: unknown) => console.log(`[test-email ${reqId}] ${m}`, x ?? "");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: cErr } = await userClient.auth.getClaims(token);
    if (cErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const { recipient } = (await req.json().catch(() => ({}))) as { recipient?: string };
    if (!isEmail(recipient)) {
      return json({ status: "no_recipient", detail: "Adresse email invalide." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    // Le droit de la matrice, et non plus les deux rôles hérités : envoyer un
    // message d'essai est le geste que « Régler les envois » recouvre, et cette
    // couche s'exécute avec la clé de service, donc aucune politique ne la
    // rattrape.
    const { data: autorise, error: droitErr } = await admin.rpc("has_permission", {
      _user_id: userId,
      _code: "notifications.parametrer",
    });
    if (droitErr) throw droitErr;
    if (!autorise) return json({ error: "Forbidden" }, 403);

    // Le plafond est appliqué après le contrôle du droit : un appelant sans
    // droit ne doit pas pouvoir consommer le quota de quelqu'un d'autre.
    const decision = sendLimiter.consume(userId);
    if (!decision.allowed) {
      return json({
        status: "rate_limited",
        detail: "Trop d'envois de test. Réessayez dans quelques minutes.",
        recipient,
      }, 429, { "Retry-After": String(decision.retryAfterSeconds) });
    }

    // L'envoi passe directement par Resend. Il transitait auparavant par un
    // connecteur exterieur, qui ajoutait une dependance et une cle de plus
    // sans rien apporter : ce que cette sonde doit eprouver, c'est la
    // configuration d'envoi d'Akwaba, pas celle d'un intermediaire.
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const EXPEDITEUR = Deno.env.get("NOTIFICATION_FROM");
    if (!RESEND || !EXPEDITEUR) {
      return json({
        status: "not_configured",
        detail: "RESEND_API_KEY ou NOTIFICATION_FROM manquant.",
        recipient,
      });
    }

    // L'en-tête Origin est choisi par l'appelant : il est validé avant de
    // devenir un lien dans le courriel.
    const origin = safeOrigin(req.headers.get("origin"), "https://akwaba.app");
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND}`,
        },
        body: JSON.stringify({
          // L'expediteur est celui du service, pas un domaine de
          // demonstration : une sonde qui part d'ailleurs que la production
          // n'eprouve pas la production.
          from: EXPEDITEUR,
          to: [recipient],
          subject: "Akwaba - test de livraison email",
          html: `<p>Ceci est un email de test envoyé depuis l'AdminPage Akwaba.</p>
            <p>Si vous recevez ce message, le connecteur Resend est correctement configuré.</p>
            <p><a href="${escapeHtml(`${origin}/admin`)}">Retour au back-office</a></p>`,
        }),
      });
      const text = await resp.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { /* keep */ }
      if (resp.ok) {
        log("sent", { recipient, id: parsed?.id });
        return json({
          status: "sent", recipient,
          provider_id: parsed?.id, detail: `HTTP ${resp.status}`,
        });
      }
      log("failed", { status: resp.status, text });
      return json({
        status: "failed", recipient,
        detail: `HTTP ${resp.status} ${parsed?.message ?? text.slice(0, 200)}`,
      });
    } catch (e) {
      return json({ status: "failed", recipient, detail: (e as Error).message });
    }
  } catch (e) {
    console.error(`[test-email ${reqId}] error`, e);
    return json({ error: "Erreur serveur" }, 500);
  }
});

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}
