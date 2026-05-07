import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LeadInput {
  place_id?: string | null;
  kind: "lodging" | "restaurant" | "generic";
  full_name: string;
  email: string;
  phone?: string | null;
  party_size?: number | null;
  date_from?: string | null;
  date_to?: string | null;
  budget?: string | null;
  message: string;
}

function validate(b: any): { ok: true; data: LeadInput } | { ok: false; error: string } {
  if (!b || typeof b !== "object") return { ok: false, error: "Invalid body" };
  const kind = ["lodging", "restaurant", "generic"].includes(b.kind) ? b.kind : null;
  if (!kind) return { ok: false, error: "Invalid kind" };
  if (typeof b.full_name !== "string" || b.full_name.trim().length < 2 || b.full_name.length > 120)
    return { ok: false, error: "Invalid name" };
  if (typeof b.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.email) || b.email.length > 255)
    return { ok: false, error: "Invalid email" };
  if (typeof b.message !== "string" || b.message.trim().length < 5 || b.message.length > 2000)
    return { ok: false, error: "Invalid message" };
  return {
    ok: true,
    data: {
      place_id: b.place_id ?? null,
      kind,
      full_name: b.full_name.trim(),
      email: b.email.trim(),
      phone: b.phone ?? null,
      party_size: b.party_size ? Number(b.party_size) : null,
      date_from: b.date_from || null,
      date_to: b.date_to || null,
      budget: b.budget ?? null,
      message: b.message.trim(),
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => null);
    const v = validate(body);
    if (!v.ok) {
      return new Response(JSON.stringify({ error: v.error }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Try to attach the authenticated user if a JWT is present
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
      console.error("Insert error:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: notify partner via Resend if configured
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    if (RESEND && LOVABLE && v.data.place_id) {
      try {
        const { data: place } = await supabase
          .from("places")
          .select("name, email, owner_id")
          .eq("id", v.data.place_id)
          .single();
        const recipient = place?.email;
        if (recipient) {
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
              subject: `Nouvelle demande pour ${place?.name ?? "votre établissement"}`,
              html: `<p><strong>${v.data.full_name}</strong> (${v.data.email})</p><p>${v.data.message.replace(/</g, "&lt;")}</p>`,
            }),
          });
        }
      } catch (e) {
        console.warn("Email notify failed (non-blocking):", e);
      }
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
