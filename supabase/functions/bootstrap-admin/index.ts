import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user_id, token } = await req.json();
    const expected = Deno.env.get("BOOTSTRAP_ADMIN_TOKEN");

    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: "Token invalide" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "user_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Self-disable: refuse if an admin already exists
    const { data: existing, error: selErr } = await admin
      .from("user_roles").select("id").eq("role", "admin").limit(1);
    if (selErr) throw selErr;
    if (existing && existing.length > 0) {
      return new Response(JSON.stringify({ error: "Un administrateur existe déjà. Utilisez le back-office." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: insErr } = await admin
      .from("user_roles").insert({ user_id, role: "admin" });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[edge] erreur non recuperee", e);
    return new Response(JSON.stringify({ error: "Erreur serveur" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
