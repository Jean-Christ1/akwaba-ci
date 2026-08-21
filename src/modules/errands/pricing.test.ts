import { describe, expect, it } from "vitest";

import { computeInvoice, COMMISSION_RATE as DOMAIN_RATE } from "./domain";
import {
  COMMISSION_RATE,
  MIN_PAYOUT,
  MIN_SERVICE_FEE,
  quoteErrand,
  settle,
  type QuoteInput,
} from "./pricing";

const baseQuote: QuoteInput = {
  vehicle: "moto",
  volume: "small",
  urgency: "standard",
  distanceKm: 5,
  estimatedMinutes: 60,
  dropoff: "runner_delivers",
  itemsCount: 3,
};

describe("source de vérité du taux de commission", () => {
  it("n'expose qu'une seule constante partagée entre le domaine et le moteur tarifaire", () => {
    expect(DOMAIN_RATE).toBe(COMMISSION_RATE);
  });

  it("applique le taux retenu au barème serveur", () => {
    expect(COMMISSION_RATE).toBe(0.15);
  });
});

describe("quoteErrand", () => {
  it("ne descend jamais sous le frais de service plancher", () => {
    const quote = quoteErrand({ ...baseQuote, distanceKm: 0, estimatedMinutes: 0, itemsCount: 0 });
    expect(quote.serviceFee).toBeGreaterThanOrEqual(MIN_SERVICE_FEE);
  });

  it("commissionne le frais de service et jamais les achats", () => {
    const quote = quoteErrand(baseQuote);
    expect(quote.serviceFee).toBe(quote.commission + quote.runnerPayout);
  });

  // Le serveur calcule la commission par round(service * taux, 2). Si l'écran
  // arrondit autrement, le client lit un montant et la base en enregistre un
  // autre : l'écart est silencieux et se découvre sur la facture. Cet arrondi
  // doit donc rester identique des deux côtés, à la valeur près.
  it("arrondit la commission exactement comme le serveur, au centime", () => {
    for (const distanceKm of [0, 1.4, 3.7, 8.2, 15, 27.5]) {
      const quote = quoteErrand({ ...baseQuote, distanceKm });
      const commeLeServeur = Math.round(quote.serviceFee * COMMISSION_RATE * 100) / 100;
      expect(quote.commission).toBe(commeLeServeur);
    }
  });

  it("ne commissionne jamais le budget d'achat", () => {
    const petit = quoteErrand({ ...baseQuote });
    const gros = quoteErrand({ ...baseQuote });
    // Le budget d'achat n'entre pas dans le devis : il revient au marchand.
    expect(petit.commission).toBe(gros.commission);
  });

  it("facture l'urgence et le volume en supplément", () => {
    const standard = quoteErrand(baseQuote);
    const express = quoteErrand({ ...baseQuote, urgency: "express", volume: "large" });
    expect(express.serviceFee).toBeGreaterThan(standard.serviceFee);
    expect(express.urgencyFee).toBeGreaterThan(0);
    expect(express.volumeFee).toBeGreaterThan(0);
  });

  it("réduit le prix quand le client vient récupérer lui-même", () => {
    const livre = quoteErrand({ ...baseQuote, distanceKm: 20 });
    const retrait = quoteErrand({ ...baseQuote, distanceKm: 20, dropoff: "customer_pickup" });
    expect(retrait.serviceFee).toBeLessThan(livre.serviceFee);
  });

  it("reste stable face à des entrées aberrantes", () => {
    const quote = quoteErrand({ ...baseQuote, distanceKm: -50, estimatedMinutes: -10, itemsCount: -3 });
    expect(quote.serviceFee).toBeGreaterThanOrEqual(MIN_SERVICE_FEE);
    expect(quote.distanceFee).toBe(0);
    expect(quote.timeFee).toBe(0);
    expect(quote.runnerPayout).toBeGreaterThan(0);
  });
});

describe("computeInvoice", () => {
  it("commissionne le seul frais de service, comme le moteur serveur", () => {
    const facture = computeInvoice({ itemsTotal: 25000, serviceFee: 2000, deliveryFee: 1000 });
    expect(facture.commission).toBe(Math.round(2000 * COMMISSION_RATE * 100) / 100);
    // Le transport revient au shopper au même titre que le service : le
    // serveur le lui rend, l'écran doit dire la même chose.
    expect(facture.runnerPayout).toBe(2000 + 1000 - facture.commission);
  });

  it("n'ampute jamais l'argent des achats", () => {
    const facture = computeInvoice({ itemsTotal: 100000, serviceFee: 1500, deliveryFee: 0 });
    expect(facture.total).toBe(100000 + 1500);
    expect(facture.items).toBe(100000);
  });

  it("laisse les frais de livraison au livreur, hors assiette commissionnable", () => {
    const sansLivraison = computeInvoice({ itemsTotal: 0, serviceFee: 3000, deliveryFee: 0 });
    const avecLivraison = computeInvoice({ itemsTotal: 0, serviceFee: 3000, deliveryFee: 5000 });
    expect(avecLivraison.commission).toBe(sansLivraison.commission);
  });

  it("ramène les montants négatifs à zéro", () => {
    const facture = computeInvoice({ itemsTotal: -10, serviceFee: -10, deliveryFee: -10 });
    expect(facture.items).toBe(0);
    expect(facture.service).toBe(0);
    expect(facture.delivery).toBe(0);
    expect(facture.total).toBe(0);
  });
});

describe("cohérence entre le devis et la facture", () => {
  it("annonce au shopper le même gain au devis et à la facture", () => {
    const quote = quoteErrand(baseQuote);
    const facture = computeInvoice({
      itemsTotal: 12000,
      serviceFee: quote.serviceFee,
      deliveryFee: 0,
    });
    expect(facture.commission).toBe(Math.round(quote.serviceFee * COMMISSION_RATE * 100) / 100);
    expect(Math.abs(facture.runnerPayout - quote.runnerPayout)).toBeLessThanOrEqual(50);
  });
});

describe("settle", () => {
  it("calcule le solde restant dû après une avance partielle", () => {
    const r = settle({ advanceAmount: 20000, actualItemsTotal: 25000, serviceFee: 2000 });
    expect(r.grandTotal).toBe(27000);
    expect(r.balanceDue).toBe(7000);
    expect(r.refundToCustomer).toBe(0);
  });

  it("rembourse le client quand l'avance dépasse la dépense réelle", () => {
    const r = settle({ advanceAmount: 30000, actualItemsTotal: 20000, serviceFee: 2000 });
    expect(r.balanceDue).toBe(0);
    expect(r.refundToCustomer).toBe(8000);
  });

  it("intègre le pourboire au total dû", () => {
    const sans = settle({ advanceAmount: 0, actualItemsTotal: 10000, serviceFee: 1500 });
    const avec = settle({ advanceAmount: 0, actualItemsTotal: 10000, serviceFee: 1500, tip: 1000 });
    expect(avec.grandTotal - sans.grandTotal).toBe(1000);
  });

  it("ne renvoie jamais un solde et un remboursement simultanés", () => {
    for (const advance of [0, 5000, 50000]) {
      const r = settle({ advanceAmount: advance, actualItemsTotal: 20000, serviceFee: 2000 });
      expect(r.balanceDue === 0 || r.refundToCustomer === 0).toBe(true);
    }
  });
});

describe("seuil de retrait", () => {
  it("fixe un minimum de retrait strictement positif", () => {
    expect(MIN_PAYOUT).toBeGreaterThan(0);
  });
});

describe("le devis n'arrondit qu'une fois, comme le serveur", () => {
  // Le serveur somme les composantes exactes puis arrondit au pas de
  // cinquante francs. Arrondir chaque composante avant la somme donnait un
  // montant différent de celui enregistré, sur un cas sur quatre.
  it("garde les composantes exactes et n'arrondit que le total", () => {
    // « Peu importe » : base 700, 120 FCFA/km. 2,6 km font 312, que le pas de
    // cinquante ramenait à 300 avant la somme.
    const quote = quoteErrand({
      ...baseQuote,
      vehicle: "any",
      volume: "small",
      urgency: "standard",
      dropoff: "runner_delivers",
      distanceKm: 2.6,
      estimatedMinutes: 32,
      itemsCount: 0,
    });

    expect(quote.distanceFee).toBeCloseTo(312, 6);
    expect(quote.timeFee).toBeCloseTo(20, 6);
    // 700 + 312 + 20 = 1032, arrondi une seule fois : 1050.
    expect(quote.serviceFee).toBe(1050);
  });

  it("suit le barème en vigueur plutôt que les constantes du moteur", () => {
    // Un exploitant qui publie un nouveau barème change le prix appliqué par
    // le serveur. L'écran doit suivre, sinon il annonce un prix périmé.
    const quote = quoteErrand({
      ...baseQuote,
      distanceKm: 0,
      estimatedMinutes: 0,
      itemsCount: 0,
      minServiceFee: 3000,
      commissionRate: 0.2,
    });

    expect(quote.serviceFee).toBe(3000);
    expect(quote.commission).toBe(600);
    expect(quote.runnerPayout).toBe(2400);
  });
});

describe("la facture affichée vaut celle que le serveur enregistre", () => {
  // errand_save_invoice retient v_service = service_fee + overrun_fee,
  // v_total = items + v_service + livraison + pourboire, et
  // runner_payout = v_service + livraison - commission + pourboire.
  it("compte le dépassement dans le service et dans le total", () => {
    const f = computeInvoice({
      itemsTotal: 14000,
      serviceFee: 2500,
      overrunFee: 450,
      deliveryFee: 0,
      commissionRate: 0.15,
    });

    expect(f.overrun).toBe(450);
    expect(f.service).toBe(2950);
    expect(f.total).toBe(16950);
  });

  it("ajoute le pourboire au total et le rend entier au shopper", () => {
    const sans = computeInvoice({ itemsTotal: 0, serviceFee: 2000, deliveryFee: 0, commissionRate: 0.15 });
    const avec = computeInvoice({
      itemsTotal: 0,
      serviceFee: 2000,
      deliveryFee: 0,
      tipAmount: 500,
      commissionRate: 0.15,
    });

    expect(avec.total - sans.total).toBe(500);
    // Le pourboire n'est jamais commissionné.
    expect(avec.commission).toBe(sans.commission);
    expect(avec.runnerPayout - sans.runnerPayout).toBe(500);
  });

  it("rend la livraison au shopper, comme le serveur", () => {
    const f = computeInvoice({ itemsTotal: 0, serviceFee: 2000, deliveryFee: 800, commissionRate: 0.15 });

    expect(f.commission).toBe(300);
    expect(f.runnerPayout).toBe(2500);
  });

  it("élargit l'assiette quand le barème le prévoit", () => {
    const f = computeInvoice({
      itemsTotal: 0,
      serviceFee: 2000,
      deliveryFee: 1000,
      commissionRate: 0.15,
      commissionBase: "service_and_delivery",
    });

    expect(f.commission).toBe(450);
  });
});
