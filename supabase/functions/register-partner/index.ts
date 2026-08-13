import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { clientIp, SlidingWindowRateLimiter } from "../_shared/rate_limit.ts";
import { slugify, slugSuffix, validatePlaceDraft } from "./validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Un partenaire honnête dépose sa fiche une fois, éventuellement deux après
 * correction. Au-delà, la fonction sert d'outil de remplissage de la file de
 * modération.
 */
const SUBMIT_WINDOW_MS = 60 * 60 * 1000;
const SUBMIT_LIMIT = 3;

const submitLimiter = new SlidingWindowRateLimiter({
  limit: SUBMIT_LIMIT,
  windowMs: SUBMIT_WINDOW_MS,
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;
    if (typeof userId !== "string" || userId.length === 0) {
      return json({ error: "Unauthorized" }, 401);
    }

    // La double clé couvre le compte jetable comme la rafale d'une seule
    // machine qui enchaînerait les inscriptions.
    for (const key of [`user:${userId}`, `ip:${clientIp(req)}`]) {
      const decision = submitLimiter.consume(key);
      if (!decision.allowed) {
        return json(
          { error: "Trop de fiches envoyées. Réessayez plus tard." },
          429,
          { "Retry-After": String(decision.retryAfterSeconds) },
        );
      }
    }

    const body = await req.json().catch(() => null);
    const v = validatePlaceDraft((body as { place?: unknown } | null)?.place);
    if (!v.ok) return json({ error: v.error }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Attribution du rôle partenaire (idempotente).
    const { data: existingRole } = await admin
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "partner").maybeSingle();
    if (!existingRole) {
      const { error: roleErr } = await admin
        .from("user_roles").insert({ user_id: userId, role: "partner" });
      if (roleErr) throw roleErr;
    }

    const payload = {
      ...v.data,
      // Un nom sans caractère latin donnerait une base vide : le slug garde
      // alors un préfixe neutre plutôt que de commencer par un tiret.
      slug: `${slugify(v.data.name) || "fiche"}-${slugSuffix()}`,
      owner_id: userId,
      status: "pending",
    };

    const { data, error } = await admin.from("places").insert(payload).select("id, slug").single();
    if (error) throw error;

    return json({ success: true, place: data });
  } catch (e) {
    console.error("[register-partner] erreur non récupérée", e);
    return json({ error: "Erreur serveur" }, 500);
  }
});
