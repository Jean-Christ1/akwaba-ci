import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { clientIp, SlidingWindowRateLimiter } from "../_shared/rate_limit.ts";
import { isEmail } from "../_shared/validation.ts";
import { buildPartnerEmailHtml, buildPartnerEmailSubject, validateLead } from "./lead.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Fenêtre courte : elle vise la rafale automatisée, pas le visiteur pressé. */
const IP_WINDOW_MS = 10 * 60 * 1000;
const IP_LIMIT = 5;

/**
 * Fenêtre longue par établissement : elle protège la boîte du partenaire, qui
 * reçoit un courriel par demande, même si les demandes viennent d'un parc
 * d'adresses différentes.
 */
const PLACE_WINDOW_MS = 60 * 60 * 1000;
const PLACE_LIMIT = 20;

const ipLimiter = new SlidingWindowRateLimiter({ limit: IP_LIMIT, windowMs: IP_WINDOW_MS });

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

/**
 * Comptage durable des demandes reçues par un établissement sur la fenêtre.
 * En cas d'échec du comptage, on laisse passer : la même base servirait de
 * toute façon l'insertion qui suit, et le compteur par adresse reste actif.
 */
async function placeQuotaExceeded(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  placeId: string,
): Promise<boolean> {
  const since = new Date(Date.now() - PLACE_WINDOW_MS).toISOString();
  const { count, error } = await supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId)
    .gte("created_at", since);
  if (error) {
    console.warn("[submit-lead] comptage par établissement indisponible");
    return false;
  }
  return (count ?? 0) >= PLACE_LIMIT;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ipDecision = ipLimiter.consume(clientIp(req));
    if (!ipDecision.allowed) {
      return json(
        { error: "Trop de demandes envoyées. Réessayez dans quelques minutes." },
        429,
        { "Retry-After": String(ipDecision.retryAfterSeconds) },
      );
    }

    const body = await req.json().catch(() => null);
    const v = validateLead(body);
    if (!v.ok) return json({ error: v.error }, 400);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (v.data.place_id && await placeQuotaExceeded(supabase, v.data.place_id)) {
      return json(
        { error: "Cet établissement reçoit trop de demandes en ce moment. Réessayez plus tard." },
        429,
        { "Retry-After": String(Math.ceil(PLACE_WINDOW_MS / 1000)) },
      );
    }

    // Rattachement de l'utilisateur connecté quand un jeton est présent.
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data } = await supabase.auth.getUser(token);
      userId = data.user?.id ?? null;
    }

    const { data, error } = await supabase
      .from("leads")
      .insert({ ...v.data, user_id: userId })
      .select("id")
      .single();

    if (error) {
      // Le message PostgreSQL décrit le schéma : il reste dans les journaux.
      console.error("[submit-lead] insertion refusée", error);
      return json({ error: "Enregistrement impossible pour le moment." }, 500);
    }

    // Notification du partenaire, si le connecteur est configuré.
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    if (RESEND && LOVABLE && v.data.place_id) {
      try {
        const { data: place } = await supabase
          .from("places")
          .select("name, email, owner_id")
          .eq("id", v.data.place_id)
          .single();
        // L'adresse vient de la fiche partenaire : on ne la transmet au
        // connecteur que si elle a la forme d'une adresse.
        const recipient = typeof place?.email === "string" ? place.email.trim() : "";
        if (isEmail(recipient)) {
          await fetch("https://connector-gateway.lovable.dev/resend/emails", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${LOVABLE}`,
              "X-Connection-Api-Key": RESEND,
            },
            body: JSON.stringify({
              from: "Akwaba <onboarding@resend.dev>",
              to: [recipient],
              subject: buildPartnerEmailSubject(place?.name),
              html: buildPartnerEmailHtml(v.data),
            }),
          });
        }
      } catch (e) {
        console.warn("[submit-lead] notification non bloquante en échec", e);
      }
    }

    return json({ ok: true, id: data.id }, 200);
  } catch (e) {
    console.error("[submit-lead] erreur non récupérée", e);
    return json({ error: "Erreur serveur" }, 500);
  }
});
