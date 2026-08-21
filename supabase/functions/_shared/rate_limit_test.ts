import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { clientIp, SlidingWindowRateLimiter } from "./rate_limit.ts";

Deno.test("laisse passer jusqu'à la limite puis refuse", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 60_000 });
  const t0 = 1_000_000;
  assertEquals(limiter.consume("ip", t0).allowed, true);
  assertEquals(limiter.consume("ip", t0 + 1).allowed, true);
  assertEquals(limiter.consume("ip", t0 + 2).allowed, true);
  assertEquals(limiter.consume("ip", t0 + 3).allowed, false);
});

Deno.test("un refus ne repousse pas la fenêtre", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 10_000 });
  const t0 = 500_000;
  limiter.consume("ip", t0);
  limiter.consume("ip", t0 + 9_000);
  // La fenêtre dépend du premier appel accepté, pas des tentatives refusées.
  assertEquals(limiter.consume("ip", t0 + 10_001).allowed, true);
});

Deno.test("la fenêtre glisse", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1_000 });
  const t0 = 0;
  limiter.consume("ip", t0);
  limiter.consume("ip", t0 + 100);
  assertEquals(limiter.consume("ip", t0 + 200).allowed, false);
  assertEquals(limiter.consume("ip", t0 + 1_101).allowed, true);
});

Deno.test("les clés sont indépendantes", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 });
  assertEquals(limiter.consume("ip:1", 0).allowed, true);
  assertEquals(limiter.consume("ip:2", 0).allowed, true);
  assertEquals(limiter.consume("ip:1", 0).allowed, false);
});

Deno.test("le délai d'attente annoncé est positif", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 });
  limiter.consume("ip", 0);
  const refused = limiter.consume("ip", 1_000);
  assertEquals(refused.allowed, false);
  assertEquals(refused.retryAfterSeconds, 59);
});

Deno.test("le nombre de clés suivies reste borné", () => {
  const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1_000, maxKeys: 10 });
  for (let i = 0; i < 200; i++) limiter.consume(`ip:${i}`, i);
  assertEquals(limiter.size <= 10, true);
});

Deno.test("clientIp retient la première entrée de x-forwarded-for", () => {
  const req = new Request("https://exemple.test", {
    headers: { "x-forwarded-for": "41.207.0.1, 10.0.0.1" },
  });
  assertEquals(clientIp(req), "41.207.0.1");
});

Deno.test("clientIp retombe sur une valeur par défaut", () => {
  assertEquals(clientIp(new Request("https://exemple.test")), "unknown");
});
