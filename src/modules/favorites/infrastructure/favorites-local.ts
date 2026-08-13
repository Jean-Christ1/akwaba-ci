// Adapter "Favoris" — implémentation locale (localStorage)
// Substituable plus tard par un adapter Cloud (Supabase) sans toucher l'UI.

const STORAGE_KEY = "akwaba.favorites.v1";

export interface FavoritesPort {
  list(): string[];
  has(id: string): boolean;
  toggle(id: string): boolean;
  /** Remplace l'ensemble local, après reprise des favoris du compte. */
  replace(ids: string[]): void;
  subscribe(cb: () => void): () => void;
}

class LocalFavorites implements FavoritesPort {
  private listeners = new Set<() => void>();

  private read(): string[] {
    try {
      if (typeof window === "undefined") return [];
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as string[]) : [];
    } catch {
      return [];
    }
  }

  private write(ids: string[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* quota / private mode — silencieux */
    }
    this.listeners.forEach((cb) => cb());
  }

  list() {
    return this.read();
  }
  has(id: string) {
    return this.read().includes(id);
  }
  toggle(id: string) {
    const ids = this.read();
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    this.write(next);
    return next.includes(id);
  }
  replace(ids: string[]) {
    this.write(Array.from(new Set(ids)));
  }
  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb) as unknown as void;
  }
}

export const favoritesAdapter: FavoritesPort = new LocalFavorites();
