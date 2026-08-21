import { describe, expect, it } from "vitest";
import { compresserImage, formaterOctets } from "./compresserImage";

/**
 * Réduction des photos avant envoi.
 *
 * Le cas qui compte n'est pas la compression elle-même, que le navigateur sait
 * faire : c'est tout ce qui ne doit PAS arriver. Un PDF ne doit pas être
 * transformé en image, une photo déjà légère ne doit pas être dégradée pour
 * rien, et surtout, aucune défaillance de compression ne doit empêcher le dépôt
 * d'un reçu, faute de quoi une course ne peut plus être clôturée.
 *
 * L'environnement de test n'a pas de canvas exploitable : le repli est donc
 * précisément ce qui s'exécute ici, et c'est lui qu'il faut éprouver.
 */

const fichier = (nom: string, type: string, octets: number) =>
  new File([new Uint8Array(octets)], nom, { type });

describe("compresserImage", () => {
  it("laisse un PDF intact", async () => {
    const source = fichier("recu.pdf", "application/pdf", 2 * 1024 * 1024);
    const r = await compresserImage(source);

    expect(r.compressee).toBe(false);
    expect(r.fichier).toBe(source);
    expect(r.fichier.type).toBe("application/pdf");
  });

  it("laisse intacte une image déjà légère", async () => {
    const source = fichier("petit.jpg", "image/jpeg", 120 * 1024);
    const r = await compresserImage(source);

    expect(r.compressee).toBe(false);
    expect(r.fichier).toBe(source);
  });

  it("respecte le seuil qu'on lui donne", async () => {
    const source = fichier("moyen.jpg", "image/jpeg", 300 * 1024);

    const sousLeSeuil = await compresserImage(source, { seuilOctets: 500 * 1024 });
    expect(sousLeSeuil.compressee).toBe(false);
  });

  it("rend toujours un fichier exploitable, même quand la compression échoue", async () => {
    // Une image que le navigateur ne sait pas décoder : le dépôt d'une preuve
    // ne doit jamais échouer pour cette raison, sans quoi une course reste
    // bloquée à la clôture.
    const source = fichier("illisible.jpg", "image/jpeg", 3 * 1024 * 1024);
    const r = await compresserImage(source);

    expect(r.fichier).toBeInstanceOf(File);
    expect(r.fichier.size).toBeGreaterThan(0);
    expect(r.octetsAvant).toBe(3 * 1024 * 1024);
  });

  it("annonce toujours la taille d'origine", async () => {
    const source = fichier("photo.jpg", "image/jpeg", 5 * 1024 * 1024);
    const r = await compresserImage(source);

    expect(r.octetsAvant).toBe(5 * 1024 * 1024);
    expect(r.octetsApres).toBeGreaterThan(0);
    expect(r.octetsApres).toBeLessThanOrEqual(r.octetsAvant);
  });
});

describe("formaterOctets", () => {
  it("choisit l'unité lisible par un humain", () => {
    expect(formaterOctets(512)).toBe("512 o");
    expect(formaterOctets(2048)).toBe("2 Ko");
    expect(formaterOctets(3 * 1024 * 1024)).toBe("3.0 Mo");
  });

  it("ne rend jamais une valeur négative ou vide", () => {
    expect(formaterOctets(0)).toBe("0 o");
    expect(formaterOctets(1)).toBe("1 o");
  });
});
