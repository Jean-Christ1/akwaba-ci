import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { slugify, slugSuffix, validatePlaceDraft } from "./validate.ts";

const base = {
  name: "Maquis du Plateau",
  type: "maquis",
  city: "Abidjan",
  address: "Rue du Commerce, Plateau",
  description: "Maquis familial servant du poisson braisé et de l'attiéké tous les soirs.",
};

Deno.test("accepte une fiche minimale et applique les valeurs par défaut", () => {
  const r = validatePlaceDraft(base);
  assertEquals(r.ok, true);
  if (!r.ok) return;
  assertEquals(r.data.standing, 3);
  assertEquals(r.data.price_band, "€€");
  assertEquals(r.data.gallery, []);
  assertEquals(r.data.services, []);
});

Deno.test("accepte les champs numériques transmis en chaîne", () => {
  const r = validatePlaceDraft({ ...base, lat: "5.32", lng: "-4.03", standing: "5" });
  assertEquals(r.ok, true);
  if (r.ok) {
    assertEquals(r.data.lat, 5.32);
    assertEquals(r.data.standing, 5);
  }
});

Deno.test("refuse un type hors de l'énumération", () => {
  assertEquals(validatePlaceDraft({ ...base, type: "banque" }).ok, false);
});

Deno.test("refuse des coordonnées non numériques ou hors du pays", () => {
  assertEquals(validatePlaceDraft({ ...base, lat: "abc" }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, lat: 48.85, lng: 2.35 }).ok, false);
});

Deno.test("refuse un standing hors bornes", () => {
  assertEquals(validatePlaceDraft({ ...base, standing: 9 }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, standing: "0" }).ok, false);
});

Deno.test("refuse un texte démesuré", () => {
  assertEquals(validatePlaceDraft({ ...base, description: "x".repeat(4001) }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, name: "x".repeat(121) }).ok, false);
});

Deno.test("refuse une liste qui n'en est pas une", () => {
  assertEquals(validatePlaceDraft({ ...base, services: "piscine" }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, tags: [1, 2] }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, tags: new Array(31).fill("x") }).ok, false);
});

Deno.test("refuse une adresse de site non http", () => {
  assertEquals(validatePlaceDraft({ ...base, website: "javascript:alert(1)" }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, image: "data:text/html,<script>" }).ok, false);
  assertEquals(validatePlaceDraft({ ...base, gallery: ["ftp://exemple.test/x.jpg"] }).ok, false);
});

Deno.test("refuse une adresse email de contact malformée", () => {
  assertEquals(validatePlaceDraft({ ...base, email: "contact(at)exemple" }).ok, false);
});

Deno.test("ignore les champs de gouvernance envoyés par l'appelant", () => {
  const r = validatePlaceDraft({
    ...base,
    status: "published",
    premium: true,
    owner_id: "00000000-0000-4000-8000-000000000000",
    slug: "fiche-choisie",
  });
  assertEquals(r.ok, true);
  if (!r.ok) return;
  const keys = Object.keys(r.data);
  assertEquals(keys.includes("status"), false);
  assertEquals(keys.includes("premium"), false);
  assertEquals(keys.includes("owner_id"), false);
  assertEquals(keys.includes("slug"), false);
});

Deno.test("le slug est normalisé et son suffixe est aléatoire", () => {
  assertEquals(slugify("Maquis du Plateau"), "maquis-du-plateau");
  assertEquals(slugify("Hôtel Éburnéa"), "hotel-eburnea");
  const suffix = slugSuffix();
  assertEquals(suffix.length, 8);
  assertEquals(suffix !== slugSuffix(), true);
});
