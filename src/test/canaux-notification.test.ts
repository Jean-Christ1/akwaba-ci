import { describe, expect, it } from "vitest";

import { numeroJoignable } from "@/modules/account/ui/NotificationChannelCard";

/**
 * Le numéro que l'écran accepte doit être celui que le serveur accepte.
 *
 * Le routage traite un numéro de moins de huit chiffres comme absent et
 * bascule sur le canal suivant. Si l'écran enregistrait un numéro plus court,
 * la personne croirait être joignable sur WhatsApp alors que ses messages
 * partiraient ailleurs, sans qu'elle en sache rien.
 */
describe("numéro joignable", () => {
  it("accepte un numéro ivoirien complet, avec ou sans mise en forme", () => {
    expect(numeroJoignable("+225 07 00 00 00 01")).toBe(true);
    expect(numeroJoignable("0700000001")).toBe(true);
    expect(numeroJoignable("+225-07-00-00-00-01")).toBe(true);
  });

  it("refuse ce que le serveur traiterait comme absent", () => {
    expect(numeroJoignable("0700")).toBe(false);
    expect(numeroJoignable("")).toBe(false);
    expect(numeroJoignable("+225")).toBe(false);
  });

  it("compte les chiffres, pas les caractères", () => {
    // Sept chiffres noyés dans de la ponctuation restent sept chiffres.
    expect(numeroJoignable("(0)7-00-00-0")).toBe(false);
    // Huit chiffres suffisent, quelle que soit la mise en forme autour.
    expect(numeroJoignable("(0)7-00-00-00")).toBe(true);
  });
});
