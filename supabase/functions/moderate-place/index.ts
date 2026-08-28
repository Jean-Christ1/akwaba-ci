import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { sanitizeHeaderText } from "../_shared/html.ts";
import { isUuid } from "../_shared/validation.ts";
import { validateNote } from "./validate.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // La fiche d'abord : le droit de la moderer se verifie dans sa ville, et
    // la ville est portee par la fiche. Verifier avant de la charger revenait a
    // ne pouvoir verifier que « quelque part ».
    const { data: place, error: pErr } = await admin
      .from("places").select("id, name, email, owner_id, status, city").eq("id", place_id).single();
    if (pErr || !place) return json({ error: "Fiche introuvable" }, 404);

    // Le droit de la matrice, et sa ville. La fonction lisait user_roles en
    // direct et acceptait les deux roles herites : un responsable de contenu a
    // qui la console affiche « Moderer les lieux » se faisait refuser, et un
    // ancien moderateur sans role dans la matrice passait encore. Cette couche
    // s'execute avec la cle de service, donc aucune politique ne la rattrape.
    const { data: autorise, error: droitErr } = await admin.rpc("has_scoped_permission", {
      _user_id: userId,
      _code: "lieux.moderer",
      _scope_value: place.city,
    });
    if (droitErr) throw droitErr;
    if (!autorise) return json({ error: "Forbidden" }, 403);

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

    // L'avis au partenaire passe par la file de notifications.
    //
    // Il partait auparavant par un appel direct a un connecteur exterieur,
    // avec un expediteur de demonstration, et sans reprise : un echec restait
    // dans les journaux de la fonction, et le moderateur voyait « failed »
    // sans que rien ne soit rejoue. Le partenaire, lui, n'apprenait jamais que
    // sa fiche avait ete validee ou refusee.
    //
    // La file choisit aussi le canal. Sur les etablissements publies, un seul
    // a une adresse renseignee et quatre ont un numero WhatsApp : prevenir par
    // courriel seul touchait un partenaire sur sept.
    let email: { status: string; detail?: string; recipient?: string } = {
      status: "skipped",
      detail: "action 'note' n'envoie pas d'avis",
    };

    if (action !== "note") {
      // Le nom de la fiche vient de l'exterieur : il est nettoye avant
      // d'entrer dans un sujet de message.
      const placeName = sanitizeHeaderText(place.name, 120) || "votre etablissement";
      const subject = action === "approved"
        ? `Votre fiche « ${placeName} » est validee`
        : `Votre fiche « ${placeName} » demande des ajustements`;
      const intro = action === "approved"
        ? `Bonne nouvelle : votre etablissement ${placeName} est desormais publie sur Akwaba.`
        : `Votre fiche ${placeName} n'a pas pu etre validee en l'etat.`;
      const corps = v.note
        ? `${intro}

Note du moderateur :
${v.note}`
        : intro;

      // v porte la note validee, pas la fiche. Avec v.place_id, l'avis partait
      // avec un identifiant vide et le partenaire n'etait jamais prevenu.
      const { data: depot, error: depotErr } = await admin.rpc("place_notify", {
        p_place_id: place_id,
        p_event: `moderation_${action}`,
        p_subject: subject,
        p_body: corps,
      });

      if (depotErr) {
        email = { status: "failed", detail: depotErr.message };
        log("avis non depose", email);
      } else if (depot?.depose) {
        // « Depose », pas « envoye » : le porteur s'en charge ensuite, et le
        // dire autrement laisserait croire que le partenaire l'a deja recu.
        email = { status: "queued", detail: `canal ${depot.canal}` };
        log("avis depose", { canal: depot.canal });
      } else {
        email = { status: "no_recipient", detail: depot?.motif ?? "aucun moyen de joindre" };
        log("partenaire injoignable", email);
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
