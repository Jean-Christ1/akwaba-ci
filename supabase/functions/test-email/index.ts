import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    if (!recipient || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipient)) {
      return json({ status: "no_recipient", detail: "Adresse email invalide." }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "moderator");
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const RESEND = Deno.env.get("RESEND_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    if (!RESEND || !LOVABLE) {
      return json({
        status: "not_configured",
        detail: "RESEND_API_KEY ou LOVABLE_API_KEY manquant.",
        recipient,
      });
    }

    const origin = req.headers.get("origin") ?? "https://akwaba.app";
    try {
      const resp = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE}`,
          "X-Connection-Api-Key": RESEND,
        },
        body: JSON.stringify({
          from: "Akwaba <onboarding@resend.dev>",
          to: [recipient],
          subject: "Akwaba — test de livraison email",
          html: `<p>Ceci est un email de test envoyé depuis l'AdminPage Akwaba.</p>
            <p>Si vous recevez ce message, le connecteur Resend est correctement configuré.</p>
            <p><a href="${origin}/admin">Retour au back-office</a></p>`,
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
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
