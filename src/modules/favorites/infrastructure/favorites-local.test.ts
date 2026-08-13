import { beforeEach, describe, expect, it, vi } from "vitest";

import { favoritesAdapter } from "./favorites-local";

const PLACE_A = "11111111-0000-4000-8000-000000000001";
const PLACE_B = "11111111-0000-4000-8000-000000000002";

beforeEach(() => {
  localStorage.clear();
});

describe("favoritesAdapter", () => {
  it("part d'un carnet vide", () => {
    expect(favoritesAdapter.list()).toEqual([]);
  });

  it("ajoute puis retire une adresse", () => {
    expect(favoritesAdapter.toggle(PLACE_A)).toBe(true);
    expect(favoritesAdapter.has(PLACE_A)).toBe(true);

    expect(favoritesAdapter.toggle(PLACE_A)).toBe(false);
    expect(favoritesAdapter.has(PLACE_A)).toBe(false);
  });

  it("conserve plusieurs adresses indépendamment", () => {
    favoritesAdapter.toggle(PLACE_A);
    favoritesAdapter.toggle(PLACE_B);
    expect(favoritesAdapter.list()).toHaveLength(2);

    favoritesAdapter.toggle(PLACE_A);
    expect(favoritesAdapter.list()).toEqual([PLACE_B]);
  });

  it("remplace l'ensemble local après reprise du compte, sans doublon", () => {
    favoritesAdapter.toggle(PLACE_A);
    favoritesAdapter.replace([PLACE_A, PLACE_B, PLACE_A]);

    expect(favoritesAdapter.list()).toEqual([PLACE_A, PLACE_B]);
  });

  it("prévient les abonnés à chaque changement", () => {
    const observer = vi.fn();
    const unsubscribe = favoritesAdapter.subscribe(observer);

    favoritesAdapter.toggle(PLACE_A);
    expect(observer).toHaveBeenCalledTimes(1);

    favoritesAdapter.replace([PLACE_B]);
    expect(observer).toHaveBeenCalledTimes(2);

    unsubscribe();
    favoritesAdapter.toggle(PLACE_A);
    expect(observer).toHaveBeenCalledTimes(2);
  });

  it("survit à un contenu illisible dans le stockage", () => {
    localStorage.setItem("akwaba.favorites.v1", "{ceci n'est pas du json");
    expect(favoritesAdapter.list()).toEqual([]);
  });
});
