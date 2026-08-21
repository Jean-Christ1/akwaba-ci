import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { escapeHtml, escapeHtmlMultiline, safeOrigin, sanitizeHeaderText } from "../_shared/html.ts";
import { isEmail, isUuid } from "../_shared/validation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const NOTE_MAX = 2000;
const PROHIBITED = [
  /\b(fuck|shit|bitch|asshole|connard|enculé|salope|pute)\b/i,
  /<script\b/i,
  /https?:\/\/\S{0,}\.(ru|tk|xyz)\b/i,
];

export function validateNote(action: string, note: string | null | undefined): { ok: true; note: string | null } | { ok: false; error: string } {
  const n = (note ?? "").trim();
  if (action === "rejected" && n.length < 10) {
    return { ok: false, error: "Une note d'au moins 10 caractères est requise pour un refus." };
  }
  if (n.length > NOTE_MAX) {
    return { ok: false, error: `Note trop longue (max ${NOTE_MAX} caractères).` };
  }
  for (const re of PROHIBITED) {
    if (re.test(n)) return { ok: false, error: "Contenu de la note non autorisé." };
  }
  return { ok: true, note: n.length ? n : null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const reqId = crypto.randomUUID().slice(0, 8);
  const log = (msg: string, extra?: unknown) =>
    console.log(`[moderate-place ${reqId}] ${msg}`, extra ?? "");

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const token = authHeader.replace("Bearer ", "");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const { place_id, action, note } = body as {
      place_id?: string; action?: "approved" | "rejected" | "note"; note?: string;
    };

    if (!isUuid(place_id) || !["approved", "rejected", "note"].includes(action ?? "")) {
      return json({ error: "place_id (uuid) et action requis" }, 400);
    }

    const v = validateNote(action!, note);
    if (!v.ok) return json({ error: v.error }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: roles } = await admin
      .from("user_roles").select("role").eq("user_id", userId);
    const allowed = (roles ?? []).some((r) => r.role === "admin" || r.role === "moderator");
    if (!allowed) return json({ error: "Forbidden" }, 403);

    const { data: place, error: pErr } = await admin
      .from("places").select("id, name, email, owner_id, status").eq("id", place_id).single();
    if (pErr || !place) return json({ error: "Fiche introuvable" }, 404);

    if (action === "approved" || action === "rejected") {
      const newStatus = action === "approved" ? "published" : "rejected";
      const { error: updErr } = await admin
        .from("places").update({ status: newStatus }).eq("id", place_id);
      if (updErr) throw updErr;
    }

    const { error: evErr } = await admin
      .from("place_moderation_events")
      .insert({ place_id, moderator_id: userId, action, note: v.note });
    if (evErr) throw evErr;

    // Email delivery - return verbose status
    const RESEND = Deno.env.get("RESEND_API_KEY");
    const LOVABLE = Deno.env.get("LOVABLE_API_KEY");
    let email: { status: string; detail?: string; provider_id?: string; recipient?: string } = {
      status: "skipped",
      detail: "action 'note' n'envoie pas d'email",
    };

    if (action !== "note") {
      // L'adresse de la fiche est saisie par le partenaire : elle n'est
      // retenue que si elle a la forme d'une adresse.
      const declared = (place.email ?? "").trim();
      let recipient: string | null = isEmail(declared) ? declared : null;
      if (!recipient && place.owner_id) {
        const { data: { user } } = await admin.auth.admin.getUserById(place.owner_id);
        const ownerEmail = (user?.email ?? "").trim();
        recipient = isEmail(ownerEmail) ? ownerEmail : null;
      }
      if (!recipient) {
        email = { status: "no_recipient", detail: "Aucune adresse email connue pour cette fiche." };
      } else if (!RESEND || !LOVABLE) {
        email = {
          status: "not_configured",
          detail: "Connecteur Resend non configuré (RESEND_API_KEY/LOVABLE_API_KEY manquants).",
          recipient,
        };
      } else {
        // Le nom de la fiche et l'en-tête Origin viennent tous deux de
        // l'extérieur : ils sont nettoyés avant d'entrer dans le courriel.
        const origin = safeOrigin(req.headers.get("origin"), "https://akwaba.app");
        const placeName = sanitizeHeaderText(place.name, 120) || "votre établissement";
        const subject = action === "approved"
          ? `Votre fiche "${placeName}" est validée`
          : `Votre fiche "${placeName}" nécessite des ajustements`;
        const safeName = escapeHtml(placeName);
        const intro = action === "approved"
          ? `<p>Bonne nouvelle ! Votre établissement <strong>${safeName}</strong> est désormais publié sur Akwaba.</p>`
          : `<p>Votre fiche <strong>${safeName}</strong> n'a pas pu être validée en l'état.</p>`;
        const noteHtml = v.note
          ? `<p><em>Note du modérateur :</em><br/>${escapeHtmlMultiline(v.note)}</p>`
          : "";
        const cta = `<p><a href="${escapeHtml(`${origin}/profil`)}" style="display:inline-block;padding:10px 16px;background:#0f766e;color:#fff;text-decoration:none;border-radius:6px">Accéder à mon profil</a></p>`;
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
              subject,
              html: `${intro}${noteHtml}${cta}`,
            }),
          });
          const text = await resp.text();
          let parsed: any = null;
          try { parsed = JSON.parse(text); } catch { /* keep text */ }
          if (resp.ok) {
            email = {
              status: "sent",
              recipient,
              provider_id: parsed?.id ?? undefined,
              detail: `HTTP ${resp.status}`,
            };
            log("email sent", { recipient, id: parsed?.id });
          } else {
            email = {
              status: "failed",
              recipient,
              detail: `HTTP ${resp.status} ${parsed?.message ?? text.slice(0, 200)}`,
            };
            log("email failed", email);
          }
        } catch (e) {
          email = { status: "failed", recipient, detail: (e as Error).message };
          log("email exception", email);
        }
      }
    }

    return json({ success: true, action, email });
  } catch (e) {
    console.error(`[moderate-place ${reqId}] error`, e);
    return json({ error: "Erreur serveur" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
