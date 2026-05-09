import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function slugify(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub as string;

    const body = await req.json();
    const { place } = body;
    if (!place?.name || !place?.type || !place?.city || !place?.address || !place?.description) {
      return new Response(JSON.stringify({ error: "Champs requis manquants" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Grant partner role (idempotent)
    const { data: existingRole } = await admin
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "partner").maybeSingle();
    if (!existingRole) {
      await admin.from("user_roles").insert({ user_id: userId, role: "partner" });
    }

    const slug = `${slugify(place.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const payload = {
      slug,
      name: place.name,
      type: place.type,
      city: place.city,
      zone: place.zone ?? null,
      address: place.address,
      tagline: place.tagline ?? null,
      description: place.description,
      story: place.story ?? null,
      lat: Number(place.lat ?? 5.32),
      lng: Number(place.lng ?? -4.03),
      standing: Number(place.standing ?? 3),
      price_band: place.price_band ?? "€€",
      phone: place.phone ?? null,
      whatsapp: place.whatsapp ?? null,
      email: place.email ?? null,
      website: place.website ?? null,
      image: place.image ?? null,
      gallery: place.gallery ?? [],
      services: place.services ?? [],
      tags: place.tags ?? [],
      cuisines: place.cuisines ?? [],
      why_visit: place.why_visit ?? [],
      best_for: place.best_for ?? [],
      best_time: place.best_time ?? null,
      practical_tips: place.practical_tips ?? [],
      average_duration: place.average_duration ?? null,
      owner_id: userId,
      status: "pending",
    };

    const { data, error } = await admin.from("places").insert(payload).select("id, slug").single();
    if (error) throw error;

    return new Response(JSON.stringify({ success: true, place: data }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
