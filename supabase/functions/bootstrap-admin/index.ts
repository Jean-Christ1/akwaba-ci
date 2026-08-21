import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { clientIp, SlidingWindowRateLimiter } from "../_shared/rate_limit.ts";
import { timingSafeEqual } from "../_shared/secure_compare.ts";
import { isUuid } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Cette fonction accorde le rôle administrateur : elle ne doit servir qu'une
 * fois. Le compteur ralentit une recherche de jeton par essais successifs.
 */
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPT_LIMIT = 5;

const attemptLimiter = new SlidingWindowRateLimiter({
  limit: ATTEMPT_LIMIT,
  windowMs: ATTEMPT_WINDOW_MS,
});

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const decision = attemptLimiter.consume(clientIp(req));
    if (!decision.allowed) {
      return json({ error: "Trop de tentatives." }, 429, {
        "Retry-After": String(decision.retryAfterSeconds),
      });
    }

    const body = await req.json().catch(() => null);
    const { user_id, token } = (body ?? {}) as { user_id?: unknown; token?: unknown };
    const expected = Deno.env.get("BOOTSTRAP_ADMIN_TOKEN");

    if (!expected || typeof token !== "string" || !timingSafeEqual(token, expected)) {
      return json({ error: "Token invalide" }, 401);
    }
    if (!isUuid(user_id)) {
      return json({ error: "user_id requis (identifiant uuid)" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auto-désactivation : la fonction refuse dès qu'un administrateur existe.
    const { data: existing, error: selErr } = await admin
      .from("user_roles").select("id").eq("role", "admin").limit(1);
    if (selErr) throw selErr;
    if (existing && existing.length > 0) {
      return json(
        { error: "Un administrateur existe déjà. Utilisez le back-office." },
        403,
      );
    }

    const { error: insErr } = await admin
      .from("user_roles").insert({ user_id, role: "admin" });
    if (insErr) throw insErr;

    return json({ success: true });
  } catch (e) {
    console.error("[bootstrap-admin] erreur non récupérée", e);
    return json({ error: "Erreur serveur" }, 500);
  }
});
