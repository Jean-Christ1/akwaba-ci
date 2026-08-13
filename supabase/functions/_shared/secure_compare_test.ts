import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { timingSafeEqual } from "./secure_compare.ts";

Deno.test("reconnaît deux valeurs identiques", () => {
  assertEquals(timingSafeEqual("jeton-de-secours", "jeton-de-secours"), true);
});

Deno.test("refuse un préfixe correct", () => {
  assertEquals(timingSafeEqual("jeton", "jeton-de-secours"), false);
  assertEquals(timingSafeEqual("jeton-de-secours", "jeton"), false);
});

Deno.test("refuse une valeur vide face à un secret", () => {
  assertEquals(timingSafeEqual("", "jeton-de-secours"), false);
});

Deno.test("compare correctement des caractères non ASCII", () => {
  assertEquals(timingSafeEqual("clé-éàç", "clé-éàç"), true);
  assertEquals(timingSafeEqual("clé-éàç", "cle-eac"), false);
});
