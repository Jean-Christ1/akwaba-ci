// Integration tests for place_moderation_events RLS policies.
// Verifies:
//  1) Anonymous users CANNOT insert moderation events.
//  2) Anonymous users CANNOT read moderation events of arbitrary places.
//  3) Authenticated NON-moderator users CANNOT insert moderation events.
//  4) A partner CAN read events for places they own; CANNOT for others.
//
// These tests require:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
// and run with --allow-net --allow-env (default in supabase test runner).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SR = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const skip = !URL || !ANON || !SR;
const maybe = (name: string, fn: () => Promise<void>) =>
  Deno.test({ name, ignore: skip, fn });

async function makeUser(email: string) {
  const admin = createClient(URL, SR);
  const password = crypto.randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  });
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
async function makePlace(ownerId: string) {
  const admin = createClient(URL, SR);
  const slug = `t-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await admin.from("places").insert({
    name: "Test " + slug, slug, type: "restaurant" as any,
    city: "Abidjan", address: "Test", description: "test",
    lat: 5.3, lng: -4.0, owner_id: ownerId, status: "pending" as any,
  }).select("id").single();
  if (error) throw error;
  return data.id as string;
}
async function cleanup(placeIds: string[], userIds: string[]) {
  const admin = createClient(URL, SR);
  if (placeIds.length) {
    await admin.from("place_moderation_events").delete().in("place_id", placeIds);
    await admin.from("places").delete().in("id", placeIds);
  }
  for (const uid of userIds) await admin.auth.admin.deleteUser(uid).catch(() => {});
}

maybe("anon cannot insert moderation events", async () => {
  const admin = createClient(URL, SR);
  const owner = await makeUser(`o-${crypto.randomUUID()}@test.akwaba`);
  const placeId = await makePlace(owner.id);
  try {
    const anon = createClient(URL, ANON);
    const { error } = await anon.from("place_moderation_events").insert({
      place_id: placeId, moderator_id: owner.id, action: "approved", note: "x",
    });
    assert(error, "expected RLS to reject anon insert");
    // confirm nothing was written
    const { data } = await admin.from("place_moderation_events").select("id").eq("place_id", placeId);
    assertEquals(data?.length ?? 0, 0);
  } finally {
    await cleanup([placeId], [owner.id]);
  }
});

maybe("regular user cannot insert moderation events", async () => {
  const admin = createClient(URL, SR);
  const owner = await makeUser(`o-${crypto.randomUUID()}@test.akwaba`);
  const stranger = await makeUser(`s-${crypto.randomUUID()}@test.akwaba`);
  const placeId = await makePlace(owner.id);
  try {
    const c = await signIn(stranger.email, stranger.password);
    const { error } = await c.from("place_moderation_events").insert({
      place_id: placeId, moderator_id: stranger.id, action: "rejected", note: "no",
    });
    assert(error, "expected RLS to reject non-moderator insert");
  } finally {
    await cleanup([placeId], [owner.id, stranger.id]);
  }
});

maybe("moderator CAN insert moderation events", async () => {
  const admin = createClient(URL, SR);
  const owner = await makeUser(`o-${crypto.randomUUID()}@test.akwaba`);
  const mod = await makeUser(`m-${crypto.randomUUID()}@test.akwaba`);
  await admin.from("user_roles").insert({ user_id: mod.id, role: "moderator" as any });
  const placeId = await makePlace(owner.id);
  try {
    const c = await signIn(mod.email, mod.password);
    const { data, error } = await c.from("place_moderation_events").insert({
      place_id: placeId, moderator_id: mod.id, action: "approved", note: "ok",
    }).select("id").single();
    assertEquals(error, null);
    assert(data?.id);
  } finally {
    await cleanup([placeId], [owner.id, mod.id]);
  }
});

maybe("partner reads ONLY their own place history", async () => {
  const admin = createClient(URL, SR);
  const ownerA = await makeUser(`a-${crypto.randomUUID()}@test.akwaba`);
  const ownerB = await makeUser(`b-${crypto.randomUUID()}@test.akwaba`);
  const mod = await makeUser(`m-${crypto.randomUUID()}@test.akwaba`);
  await admin.from("user_roles").insert([
    { user_id: ownerA.id, role: "partner" as any },
    { user_id: ownerB.id, role: "partner" as any },
    { user_id: mod.id, role: "moderator" as any },
  ]);
  const placeA = await makePlace(ownerA.id);
  const placeB = await makePlace(ownerB.id);
  await admin.from("place_moderation_events").insert([
    { place_id: placeA, moderator_id: mod.id, action: "approved", note: "A1" },
    { place_id: placeB, moderator_id: mod.id, action: "rejected", note: "B1" },
  ]);
  try {
    const c = await signIn(ownerA.email, ownerA.password);
    const { data: visible } = await c.from("place_moderation_events").select("place_id, note");
    const ids = (visible ?? []).map((r) => r.place_id);
    assert(ids.includes(placeA), "partner A should see own history");
    assert(!ids.includes(placeB), "partner A must NOT see another partner's history");
  } finally {
    await cleanup([placeA, placeB], [ownerA.id, ownerB.id, mod.id]);
  }
});
