import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

/**
 * Ordonnanceur des courses programmées.
 *
 * Une programmation n'a de sens que si quelque chose la déclenche. Cette
 * fonction est ce quelque chose : appelée périodiquement, elle republie les
 * courses dont l'échéance est atteinte.
 *
 * Elle ne décide de rien. Toute la logique, y compris le calcul de la
 * prochaine occurrence et le traitement des échecs, vit dans la base, où elle
 * est transactionnelle et vérifiable. Cette fonction n'apporte que le
 * déclenchement, qui manquait.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Resultat {
  schedule_id: string;
  errand_id: string | null;
  erreur: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const reponse = (corps: unknown, status = 200) =>
    new Response(JSON.stringify(corps), {
      status,
      headers: { ...CORS, "Content-Type": "application/json" },
    });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const CRON_SECRET = Deno.env.get("CRON_SECRET");

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return reponse({ error: "Configuration Supabase absente." }, 500);
    }

    // Un ordonnanceur ouvert permettrait de republier autant de courses que
    // voulu, au nom de clients qui n'ont rien demandé. Sans secret configuré,
    // il refuse de s'exécuter plutôt que de s'ouvrir par défaut.
    if (!CRON_SECRET) {
      return reponse({ error: "CRON_SECRET non configuré, exécution refusée." }, 503);
    }

    const fourni = req.headers.get("x-cron-secret") ?? "";
    if (fourni.length !== CRON_SECRET.length || fourni !== CRON_SECRET) {
      return reponse({ error: "Appel non autorisé." }, 401);
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data, error } = await admin.rpc("errand_schedules_run_due", { p_limit: 50 });
    if (error) return reponse({ error: error.message }, 500);

    const resultats = (data ?? []) as Resultat[];
    const creees = resultats.filter((r) => r.errand_id).length;
    const echecs = resultats.filter((r) => r.erreur);

    // Les échecs sont rendus, pas avalés : une programmation qui ne part plus
    // doit se voir, sinon un client attend une course qui n'arrivera jamais.
    return reponse({
      traitees: resultats.length,
      creees,
      echecs: echecs.length,
      detail: echecs.map((e) => ({ schedule_id: e.schedule_id, erreur: e.erreur })),
    });
  } catch (e) {
    console.error("run-schedules", e);
    return reponse({ error: "Exécution impossible." }, 500);
  }
});
