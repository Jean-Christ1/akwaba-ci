/**
 * Limitation de débit à fenêtre glissante, en mémoire de l'isolat.
 *
 * Le projet n'expose aucun magasin partagé (ni table de compteurs, ni cache
 * externe) et l'ajout d'une table demanderait une migration. Ce compteur en
 * mémoire couvre donc le cas réel à traiter : la rafale d'un robot, qui est
 * servie par un petit nombre d'isolats. Il est volontairement doublé, là où
 * c'est possible, par un comptage durable en base (voir submit-lead).
 */

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  /** Plafond de clés suivies simultanément, pour borner la mémoire. */
  maxKeys?: number;
}

export class SlidingWindowRateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;
  readonly #hits = new Map<string, number[]>();

  constructor(options: RateLimiterOptions) {
    if (options.limit < 1) throw new RangeError("limit must be >= 1");
    if (options.windowMs < 1) throw new RangeError("windowMs must be >= 1");
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#maxKeys = options.maxKeys ?? 10_000;
  }

  /**
   * Consomme un jeton pour la clé donnée. Un refus ne consomme rien, sinon un
   * robot repousserait indéfiniment sa propre fenêtre.
   */
  consume(key: string, now: number = Date.now()): RateLimitDecision {
    this.#evictIfNeeded(now);
    const threshold = now - this.#windowMs;
    const recent = (this.#hits.get(key) ?? []).filter((t) => t > threshold);

    if (recent.length >= this.#limit) {
      this.#hits.set(key, recent);
      const oldest = recent[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + this.#windowMs - now) / 1000));
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    recent.push(now);
    this.#hits.set(key, recent);
    return { allowed: true, remaining: this.#limit - recent.length, retryAfterSeconds: 0 };
  }

  /** Nombre de clés suivies. Utile aux tests de bornage mémoire. */
  get size(): number {
    return this.#hits.size;
  }

  #evictIfNeeded(now: number): void {
    if (this.#hits.size < this.#maxKeys) return;
    const threshold = now - this.#windowMs;
    for (const [key, timestamps] of this.#hits) {
      const recent = timestamps.filter((t) => t > threshold);
      if (recent.length === 0) this.#hits.delete(key);
      else this.#hits.set(key, recent);
    }
    // Si toutes les clés sont encore actives, on sacrifie les plus anciennes
    // plutôt que de laisser la mémoire croître sans borne.
    while (this.#hits.size >= this.#maxKeys) {
      const oldestKey = this.#hits.keys().next().value;
      if (oldestKey === undefined) break;
      this.#hits.delete(oldestKey);
    }
  }
}

/**
 * Adresse de l'appelant telle que vue derrière le proxy de la plateforme.
 * Seule la première entrée de X-Forwarded-For est retenue : les suivantes
 * sont ajoutées par les intermédiaires et falsifiables par le client.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown";
}
