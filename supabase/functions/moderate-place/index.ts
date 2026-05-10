import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const { place_id, action, note } = body as {
      place_id?: string; action?: "approved" | "rejected" | "note"; note?: string;
    };

    if (!place_id || !["approved", "rejected", "note"].includes(action ?? "")) {
      return new Response(JSON.stringify({ error: "place_id et action requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify caller is moderator or admin
    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "moderator");
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: place, error: pErr } = await admin
      .from("places").select("id, name, email, owner_id, status").eq("id", place_id).single();
    if (pErr || !place) {
      return new Response(JSON.stringify({ error: "Fiche introuvable" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status if approve/reject
    if (action === "approved" || action === "rejected") {
      const newStatus = action === "approved" ? "published" : "rejected";
      const { error: updErr } = await admin
        .from("places").update({ status: newStatus }).eq("id", place_id);
      if (updErr) throw updErr;
    }

    // Insert event
    const { error: evErr } = await admin
      .from("place_moderation_events")
      .insert({ place_id, moderator_id: userId, action, note: note ?? null });
    if (evErr) throw evErr;

    // Notify partner via Resend (non-blocking, optional)
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    let recipient = place.email as string | null;
    if (!recipient && place.owner_id) {
      const { data: { user } } = await admin.auth.admin.getUserById(place.owner_id);
      recipient = user?.email ?? null;
    }
    if (RESEND && LOVABLE && recipient && action !== "note") {
      const origin = req.headers.get("origin") ?? "https://akwaba.app";
      const subject = action === "approved"
        ? `Votre fiche "${place.name}" est validée 🎉`
        : `Votre fiche "${place.name}" nécessite des ajustements`;
      const intro = action === "approved"
        ? `<p>Bonne nouvelle ! Votre établissement <strong>${place.name}</strong> est désormais publié sur Akwaba.</p>`
        : `<p>Votre fiche <strong>${place.name}</strong> n'a pas pu être validée en l'état.</p>`;
      const noteHtml = note ? `<p><em>Note du modérateur :</em><br/>${note.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>` : "";
      const cta = `<p><a href="${origin}/profil" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px">Accéder à mon profil</a></p>`;
      try {
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
            subject,
            html: `${intro}${noteHtml}${cta}`,
          }),
        });
      } catch (e) {
        console.warn("Email notify failed:", e);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
