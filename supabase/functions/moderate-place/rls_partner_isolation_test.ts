// Extra RLS tests: partners must NEVER see or filter events of other places,
// even when using order/range (pagination) or filter clauses.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const skip = !URL || !ANON || !SR;
const maybe = (n: string, fn: () => Promise<void>) => Deno.test({ name: n, ignore: skip, fn });

async function mkUser(prefix: string) {
  const admin = createClient(URL, SR);
  const email = `${prefix}-${crypto.randomUUID()}@test.akwaba`;
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  return { id: data.user!.id, email, password };
}
async function signIn(email: string, password: string) {
  const c = createClient(URL, ANON);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return createClient(URL, ANON, {
    global: { headers: { Authorization: `Bearer ${data.session!.access_token}` } },
  });
}
async function mkPlace(ownerId: string, city = "Abidjan") {
  const admin = createClient(URL, SR);
  const slug = `t-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin.from("places").insert({
    name: "P " + slug, slug, type: "restaurant" as any, city, address: "x",
    description: "x", lat: 5.3, lng: -4.0, owner_id: ownerId, status: "pending" as any,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
async function cleanup(places: string[], users: string[]) {
  const a = createClient(URL, SR);
  if (places.length) {
    await a.from("place_moderation_events").delete().in("place_id", places);
    await a.from("places").delete().in("id", places);
  }
  for (const u of users) await a.auth.admin.deleteUser(u).catch(() => {});
}

maybe("partner: order+range never leaks other partners' events", async () => {
  const admin = createClient(URL, SR);
  const A = await mkUser("a");
  const B = await mkUser("b");
  const mod = await mkUser("m");
  await admin.from("user_roles").insert([
    { user_id: A.id, role: "partner" as any },
    { user_id: B.id, role: "partner" as any },
    { user_id: mod.id, role: "moderator" as any },
  ]);
  const pA = await mkPlace(A.id);
  const pB = await mkPlace(B.id);
  // 12 events on B, 1 on A → partner A pagination across B must still return only A's row
  const rows = Array.from({ length: 12 }).map((_, i) => ({
    place_id: pB, moderator_id: mod.id, action: (i % 2 ? "rejected" : "approved") as any, note: `B${i}`,
  }));
  rows.push({ place_id: pA, moderator_id: mod.id, action: "approved" as any, note: "A1" });
  await admin.from("place_moderation_events").insert(rows);
  try {
    const c = await signIn(A.email, A.password);
    // pagination
    const { data: p1 } = await c.from("place_moderation_events")
      .select("place_id, note").order("created_at", { ascending: false }).range(0, 9);
    const { data: p2 } = await c.from("place_moderation_events")
      .select("place_id, note").order("created_at", { ascending: false }).range(10, 19);
    const all = [...(p1 ?? []), ...(p2 ?? [])];
    assert(all.every((r) => r.place_id === pA), "partner must only see own place events across pages");
    assertEquals(all.length, 1);
  } finally {
    await cleanup([pA, pB], [A.id, B.id, mod.id]);
  }
});

maybe("partner: explicit filter on other place_id returns empty (not forbidden)", async () => {
  const admin = createClient(URL, SR);
  const A = await mkUser("a");
  const B = await mkUser("b");
  const mod = await mkUser("m");
  await admin.from("user_roles").insert([
    { user_id: A.id, role: "partner" as any },
    { user_id: B.id, role: "partner" as any },
    { user_id: mod.id, role: "moderator" as any },
  ]);
  const pA = await mkPlace(A.id);
  const pB = await mkPlace(B.id);
  await admin.from("place_moderation_events").insert([
    { place_id: pB, moderator_id: mod.id, action: "approved" as any, note: "secret" },
  ]);
  try {
    const c = await signIn(A.email, A.password);
    // partner A tries to target B's place explicitly + sort by note
    const { data, error } = await c.from("place_moderation_events")
      .select("id, note, place_id").eq("place_id", pB)
      .order("note", { ascending: true });
    assertEquals(error, null);
    assertEquals(data?.length ?? 0, 0, "RLS must hide rows even with explicit place_id filter");
  } finally {
    await cleanup([pA, pB], [A.id, B.id, mod.id]);
  }
});

maybe("partner: count exact never reveals other rows", async () => {
  const admin = createClient(URL, SR);
  const A = await mkUser("a");
  const B = await mkUser("b");
  const mod = await mkUser("m");
  await admin.from("user_roles").insert([
    { user_id: A.id, role: "partner" as any },
    { user_id: B.id, role: "partner" as any },
    { user_id: mod.id, role: "moderator" as any },
  ]);
  const pA = await mkPlace(A.id);
  const pB = await mkPlace(B.id);
  await admin.from("place_moderation_events").insert([
    { place_id: pB, moderator_id: mod.id, action: "approved" as any, note: "x" },
    { place_id: pB, moderator_id: mod.id, action: "rejected" as any, note: "y" },
    { place_id: pA, moderator_id: mod.id, action: "approved" as any, note: "ok" },
  ]);
  try {
    const c = await signIn(A.email, A.password);
    const { count } = await c.from("place_moderation_events")
      .select("*", { count: "exact", head: true });
    assertEquals(count ?? 0, 1, "partner count must equal own rows only");
  } finally {
    await cleanup([pA, pB], [A.id, B.id, mod.id]);
  }
});
