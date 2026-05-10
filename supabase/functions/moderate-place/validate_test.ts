import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateNote } from "./index.ts";

Deno.test("rejection requires a note of at least 10 chars", () => {
  const r = validateNote("rejected", "trop court");
  assertEquals(r.ok, true);
  const r2 = validateNote("rejected", "court");
  assertEquals(r2.ok, false);
  const r3 = validateNote("rejected", "");
  assertEquals(r3.ok, false);
});

Deno.test("approval allows empty note", () => {
  const r = validateNote("approved", "");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.note, null);
});

Deno.test("rejects content over max length", () => {
  const r = validateNote("approved", "x".repeat(2001));
  assertEquals(r.ok, false);
});

Deno.test("rejects prohibited content", () => {
  const r = validateNote("approved", "espèce de connard");
  assertEquals(r.ok, false);
  const r2 = validateNote("approved", "<script>alert(1)</script>");
  assertEquals(r2.ok, false);
});

Deno.test("trims and normalizes note", () => {
  const r = validateNote("approved", "  hello world  ");
  assertEquals(r.ok, true);
  if (r.ok) assertEquals(r.note, "hello world");
});
