import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  derniersIncidents,
  enregistrerCollecteurIncidents,
  genererReferenceIncident,
  oublierIncidents,
  signalerIncident,
  type RapportIncident,
} from "./reporting";

describe("genererReferenceIncident", () => {
  it("produit une référence au format attendu", () => {
    expect(genererReferenceIncident()).toMatch(/^AKW-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("écarte les caractères qu'on confond en dictant", () => {
    const references = Array.from({ length: 200 }, () => genererReferenceIncident()).join("");
    expect(references).not.toMatch(/[OI01BS258Z]/);
  });

  it("ne rend pas deux fois la même référence", () => {
    const tirages = new Set(Array.from({ length: 500 }, () => genererReferenceIncident()));
    expect(tirages.size).toBe(500);
  });
});

describe("signalerIncident", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    oublierIncidents();
  });

  afterEach(() => {
    enregistrerCollecteurIncidents(null);
    vi.restoreAllMocks();
  });

  it("rend une référence et le message de l'erreur", () => {
    const rapport = signalerIncident(new Error("panne simulée"), { origine: "rendu" });

    expect(rapport.reference).toMatch(/^AKW-/);
    expect(rapport.message).toBe("panne simulée");
    expect(rapport.origine).toBe("rendu");
  });

  it("accepte ce qui n'est pas une erreur sans rien casser", () => {
    expect(signalerIncident("refus du serveur").message).toBe("refus du serveur");
    expect(signalerIncident({ code: 500 }).message).toBe("erreur sans message");
  });

  it("journalise l'incident avec sa référence", () => {
    const rapport = signalerIncident(new Error("panne simulée"));
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(rapport.reference),
      expect.anything()
    );
  });

  it("transmet l'incident au collecteur branché", () => {
    const recus: RapportIncident[] = [];
    enregistrerCollecteurIncidents((rapport) => recus.push(rapport));

    const rapport = signalerIncident(new Error("panne simulée"));

    expect(recus).toHaveLength(1);
    expect(recus[0].reference).toBe(rapport.reference);
  });

  it("survit à un collecteur défaillant", () => {
    enregistrerCollecteurIncidents(() => {
      throw new Error("collecteur injoignable");
    });

    expect(() => signalerIncident(new Error("panne simulée"))).not.toThrow();
    expect(console.warn).toHaveBeenCalled();
  });

  it("conserve les derniers incidents, du plus récent au plus ancien", () => {
    const premier = signalerIncident(new Error("premier"));
    const second = signalerIncident(new Error("second"));

    const memoire = derniersIncidents();
    expect(memoire[0].reference).toBe(second.reference);
    expect(memoire[1].reference).toBe(premier.reference);
  });

  it("ne garde pas plus de cinq incidents", () => {
    for (let index = 0; index < 8; index += 1) signalerIncident(new Error(`panne ${index}`));
    expect(derniersIncidents()).toHaveLength(5);
  });
});
