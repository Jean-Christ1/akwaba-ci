// Tests d'intégration des protections livrées sur le moteur de courses.
//
// Ils prouvent, contre une vraie base, que les deux failles critiques de
// l'audit sont refermées : l'auto-validation shopper et l'écriture libre des
// colonnes monétaires. Un test qui passe ici vaut preuve ; la lecture des
// politiques n'en est qu'un indice.
//
// Exécution :
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... \
//     deno test --allow-net --allow-env supabase/functions/_tests/
//
// Les tests sont ignorés si les variables ne sont pas fournies, afin que la
// chaîne d'intégration reste verte sans secrets.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const skip = !URL || !ANON || !SR;

const maybe = (nom: string, fn: () => Promise<void>) =>
  Deno.test({ name: nom, ignore: skip, sanitizeOps: false, sanitizeResources: false, fn });

const admin = () => createClient(URL, SR);

interface Compte {
  id: string;
  client: SupabaseClient;
}

async function createAccount(prefixe: string): Promise<Compte> {
  const a = admin();
  const email = `${prefixe}-${crypto.randomUUID()}@test.akwaba`;
  const password = crypto.randomUUID();
  const { data, error } = await a.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const anon = createClient(URL, ANON);
  const { data: session, error: erreurConnexion } = await anon.auth.signInWithPassword({
    email,
    password,
  });
  if (erreurConnexion) throw erreurConnexion;

  return {
    id: data.user!.id,
    client: createClient(URL, ANON, {
      global: { headers: { Authorization: `Bearer ${session.session!.access_token}` } },
    }),
  };
}

async function supprimerComptes(ids: string[]) {
  const a = admin();
  for (const id of ids) {
    await a.auth.admin.deleteUser(id).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Contournement du contrôle KYC
// ---------------------------------------------------------------------------

maybe("un candidat shopper ne peut pas se créer directement approuvé", async () => {
  const candidat = await createAccount("kyc-insert");
  try {
    const { error } = await candidat.client.from("runner_profiles").insert({
      user_id: candidat.id,
      full_name: "Candidat Test",
      phone: "+2250700000001",
      city: "Abidjan",
      vehicle: "moto",
      status: "approved",
    });
    assert(error, "l'insertion avec status=approved doit être refusée");
  } finally {
    await supprimerComptes([candidat.id]);
  }
});

maybe("un shopper ne peut pas s'auto-approuver après coup", async () => {
  const candidat = await createAccount("kyc-update");
  try {
    const { error: erreurCreation } = await candidat.client.from("runner_profiles").insert({
      user_id: candidat.id,
      full_name: "Candidat Test",
      phone: "+2250700000002",
      city: "Abidjan",
      vehicle: "moto",
    });
    assertEquals(erreurCreation, null, "la candidature normale doit être acceptée");

    const { error } = await candidat.client
      .from("runner_profiles")
      .update({ status: "approved" })
      .eq("user_id", candidat.id);

    assert(error, "le propriétaire ne doit pas pouvoir modifier son statut");

    const { data } = await admin()
      .from("runner_profiles")
      .select("status")
      .eq("user_id", candidat.id)
      .single();
    assertEquals(data?.status, "pending", "le statut doit rester en attente");
  } finally {
    await supprimerComptes([candidat.id]);
  }
});

maybe("un shopper ne peut pas s'attribuer une note ni des missions", async () => {
  const candidat = await createAccount("kyc-reputation");
  try {
    await candidat.client.from("runner_profiles").insert({
      user_id: candidat.id,
      full_name: "Candidat Test",
      phone: "+2250700000003",
      city: "Abidjan",
      vehicle: "moto",
    });

    const { error } = await candidat.client
      .from("runner_profiles")
      .update({ rating: 5, jobs_completed: 250 })
      .eq("user_id", candidat.id);

    assert(error, "la réputation ne doit pas être modifiable par son porteur");
  } finally {
    await supprimerComptes([candidat.id]);
  }
});

// ---------------------------------------------------------------------------
// Confidentialité des données shopper
// ---------------------------------------------------------------------------

maybe("un tiers ne lit pas les coordonnées d'un shopper approuvé", async () => {
  const shopper = await createAccount("pii-shopper");
  const tiers = await createAccount("pii-tiers");
  try {
    await admin().from("runner_profiles").insert({
      user_id: shopper.id,
      full_name: "Shopper Approuvé",
      phone: "+2250700000004",
      whatsapp: "+2250700000004",
      id_doc_url: "identity-docs/secret.png",
      city: "Abidjan",
      vehicle: "moto",
      status: "approved",
    });

    const { data } = await tiers.client
      .from("runner_profiles")
      .select("phone,whatsapp,id_doc_url")
      .eq("user_id", shopper.id);

    assertEquals(data?.length ?? 0, 0, "aucune ligne ne doit remonter pour un tiers");
  } finally {
    await supprimerComptes([shopper.id, tiers.id]);
  }
});

maybe("la vitrine publique expose le nom sans jamais les coordonnées", async () => {
  const shopper = await createAccount("vitrine-shopper");
  const tiers = await createAccount("vitrine-tiers");
  try {
    await admin().from("runner_profiles").insert({
      user_id: shopper.id,
      full_name: "Shopper Vitrine",
      phone: "+2250700000005",
      city: "Abidjan",
      vehicle: "moto",
      status: "approved",
    });

    const { data, error } = await tiers.client
      .from("runner_public_profiles")
      .select("full_name,city,vehicle,rating,jobs_completed")
      .eq("user_id", shopper.id);

    assertEquals(error, null, "la vitrine doit rester lisible");
    assertEquals(data?.[0]?.full_name, "Shopper Vitrine");

    const { error: erreurColonne } = await tiers.client
      .from("runner_public_profiles")
      .select("phone")
      .eq("user_id", shopper.id);
    assert(erreurColonne, "la vitrine ne doit pas exposer de colonne de contact");
  } finally {
    await supprimerComptes([shopper.id, tiers.id]);
  }
});

// ---------------------------------------------------------------------------
// Intégrité monétaire
// ---------------------------------------------------------------------------

async function createErrand(clientCompte: Compte) {
  const { data, error } = await clientCompte.client
    .from("errands")
    .insert({
      customer_id: clientCompte.id,
      title: "Course de test",
      city: "Abidjan",
      delivery_address: "Cocody, repère test",
      budget_estimate: 10000,
      service_fee: 2000,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

maybe("le client ne peut pas déclarer sa course payée", async () => {
  const client = await createAccount("paiement-client");
  try {
    const courseId = await createErrand(client);

    const { error } = await client.client
      .from("errands")
      .update({ payment_status: "paid", status: "completed" })
      .eq("id", courseId);

    assert(error, "la clôture ne doit pas être auto-déclarable");

    const { data } = await admin()
      .from("errands")
      .select("payment_status,status")
      .eq("id", courseId)
      .single();
    assertEquals(data?.payment_status, "pending");
    assertEquals(data?.status, "open");
  } finally {
    await supprimerComptes([client.id]);
  }
});

maybe("le client ne peut pas modifier les montants de sa course", async () => {
  const client = await createAccount("montants-client");
  try {
    const courseId = await createErrand(client);

    const { error } = await client.client
      .from("errands")
      .update({ commission_amount: 0, runner_payout: 999999, total_amount: 1 })
      .eq("id", courseId);

    assert(error, "les colonnes monétaires ne doivent pas être modifiables");
  } finally {
    await supprimerComptes([client.id]);
  }
});

maybe("une course ne peut pas naître avec des montants arbitraires", async () => {
  const client = await createAccount("création-montants");
  try {
    const { error } = await client.client.from("errands").insert({
      customer_id: client.id,
      title: "Course frauduleuse",
      city: "Abidjan",
      delivery_address: "Cocody",
      commission_amount: 0,
      runner_payout: 500000,
      status: "completed",
      payment_status: "paid",
    });

    assert(error, "la création doit refuser un état et des montants fabriqués");
  } finally {
    await supprimerComptes([client.id]);
  }
});

// ---------------------------------------------------------------------------
// Retraits
// ---------------------------------------------------------------------------

maybe("un retrait supérieur au solde est refusé par le serveur", async () => {
  const shopper = await createAccount("retrait-solde");
  try {
    await admin().from("runner_profiles").insert({
      user_id: shopper.id,
      full_name: "Shopper Retrait",
      phone: "+2250700000006",
      city: "Abidjan",
      vehicle: "moto",
      status: "approved",
    });

    const { error } = await shopper.client.rpc("payout_request_create", {
      p_amount: 100000,
      p_account_id: null,
    });

    assert(error, "un retrait sans solde suffisant doit être refuse");
  } finally {
    await supprimerComptes([shopper.id]);
  }
});

maybe("l'insertion directe d'une demande de retrait est impossible", async () => {
  const shopper = await createAccount("retrait-direct");
  try {
    const { error } = await shopper.client.from("payout_requests").insert({
      user_id: shopper.id,
      amount: 50000,
    });

    assert(error, "l'insertion directe contournerait le débit du portefeuille");
  } finally {
    await supprimerComptes([shopper.id]);
  }
});

// ---------------------------------------------------------------------------
// Confidentialité du marche ouvert
// ---------------------------------------------------------------------------

maybe("le flux ouvert ne divulgue pas l'adresse exacte du client", async () => {
  const client = await createAccount("feed-client");
  const shopper = await createAccount("feed-shopper");
  try {
    await admin().from("runner_profiles").insert({
      user_id: shopper.id,
      full_name: "Shopper Feed",
      phone: "+2250700000007",
      city: "Abidjan",
      vehicle: "moto",
      status: "approved",
    });

    await createErrand(client);

    // La table n'est plus lisible par un shopper non assigné.
    const { data: parTable } = await shopper.client
      .from("errands")
      .select("delivery_address")
      .eq("status", "open");
    assertEquals(parTable?.length ?? 0, 0, "la table ne doit rien exposer avant affectation");

    // La vue de marche reste disponible, sans adresse.
    const { data: parVue, error } = await shopper.client
      .from("open_errands_feed")
      .select("id,city,zone,title");
    assertEquals(error, null, "le flux ouvert doit rester lisible");
    assert((parVue?.length ?? 0) > 0, "le flux doit contenir la course ouverte");

    const { error: erreurAdresse } = await shopper.client
      .from("open_errands_feed")
      .select("delivery_address");
    assert(erreurAdresse, "le flux ne doit pas exposer l'adresse de livraison");
  } finally {
    await supprimerComptes([client.id, shopper.id]);
  }
});

// ---------------------------------------------------------------------------
// Code de remise
// ---------------------------------------------------------------------------

maybe("le code de remise n'est lisible que par le client", async () => {
  const client = await createAccount("code-client");
  const tiers = await createAccount("code-tiers");
  try {
    const courseId = await createErrand(client);
    await admin()
      .from("errands")
      .update({ handover_code: "4242" })
      .eq("id", courseId);

    const { data: pourLeClient } = await client.client.rpc("errand_handover_code", {
      p_errand_id: courseId,
    });
    assertEquals(pourLeClient, "4242", "le client doit voir son code");

    const { data: pourLeTiers } = await tiers.client.rpc("errand_handover_code", {
      p_errand_id: courseId,
    });
    assertEquals(pourLeTiers, null, "un tiers ne doit rien obtenir");
  } finally {
    await supprimerComptes([client.id, tiers.id]);
  }
});
