import { describe, expect, it, vi } from "vitest";

import { avecReprise, estTemporaire } from "./retry";

describe("estTemporaire", () => {
  it("réessaie une coupure réseau", () => {
    expect(estTemporaire({ message: "Failed to fetch" })).toBe(true);
    expect(estTemporaire({ message: "network error" })).toBe(true);
    expect(estTemporaire({ status: 0 })).toBe(true);
  });

  it("réessaie une défaillance passagère du serveur", () => {
    expect(estTemporaire({ status: 503 })).toBe(true);
    expect(estTemporaire({ status: 429 })).toBe(true);
    expect(estTemporaire({ status: 408 })).toBe(true);
  });

  it("n'insiste jamais sur un refus définitif", () => {
    expect(estTemporaire({ status: 401 })).toBe(false);
    expect(estTemporaire({ status: 403 })).toBe(false);
    expect(estTemporaire({ status: 404 })).toBe(false);
  });

  it("n'insiste pas sur une erreur de droits ou de contrainte PostgreSQL", () => {
    expect(estTemporaire({ code: "42501" })).toBe(false);
    expect(estTemporaire({ code: "23505" })).toBe(false);
    expect(estTemporaire({ code: "22023" })).toBe(false);
  });
});

describe("avecReprise", () => {
  it("renvoie directement le résultat quand la lecture aboutit", async () => {
    const lecture = vi.fn().mockResolvedValue("ok");
    await expect(avecReprise(lecture)).resolves.toBe("ok");
    expect(lecture).toHaveBeenCalledTimes(1);
  });

  it("réessaie puis réussit après une coupure passagère", async () => {
    const lecture = vi
      .fn()
      .mockRejectedValueOnce({ message: "Failed to fetch" })
      .mockResolvedValue("ok");

    await expect(avecReprise(lecture, { attenteInitiale: 1 })).resolves.toBe("ok");
    expect(lecture).toHaveBeenCalledTimes(2);
  });

  it("abandonne immédiatement sur un refus définitif", async () => {
    const lecture = vi.fn().mockRejectedValue({ status: 403, message: "interdit" });

    await expect(avecReprise(lecture, { attenteInitiale: 1 })).rejects.toMatchObject({
      status: 403,
    });
    expect(lecture).toHaveBeenCalledTimes(1);
  });

  it("s'arrête après le nombre de tentatives prévu", async () => {
    const lecture = vi.fn().mockRejectedValue({ message: "Failed to fetch" });

    await expect(
      avecReprise(lecture, { tentatives: 2, attenteInitiale: 1 })
    ).rejects.toBeDefined();
    expect(lecture).toHaveBeenCalledTimes(3);
  });

  it("propage la dernière erreur rencontrée", async () => {
    const lecture = vi.fn().mockRejectedValue({ message: "network error", detail: "dernier" });

    await expect(
      avecReprise(lecture, { tentatives: 1, attenteInitiale: 1 })
    ).rejects.toMatchObject({ detail: "dernier" });
  });
});
