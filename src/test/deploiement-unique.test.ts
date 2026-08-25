import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Une seule configuration de déploiement, celle qui sert vraiment.
 *
 * Le dépôt portait un `vercel.json` qui déclarait la construction du frontend
 * et huit en-têtes, dont les cinq de sécurité. Or rien n'est déployé sur
 * Vercel : le compte porte onze projets, aucun nommé akwaba, l'adresse
 * `akwaba-api.vercel.app` répond 404, et le dépôt n'a jamais été lié, faute de
 * `.vercel/project.json`. Le frontend est publié par Cloudflare, sur consigne
 * explicite du propriétaire.
 *
 * Le danger n'était pas le fichier mort, mais la duplication : les mêmes
 * en-têtes déclarés à deux endroits, dont un seul lu. Quelqu'un qui durcit une
 * règle dans le fichier inerte croit avoir changé la production, et rien ne
 * bouge.
 */

const RACINE = path.resolve(__dirname, "..", "..");

/** Les cinq en-têtes que le site doit servir, vérifiés en ligne au déploiement. */
const EN_TETES_SECURITE = [
  "X-Content-Type-Options",
  "X-Frame-Options",
  "Referrer-Policy",
  "Permissions-Policy",
  "Strict-Transport-Security",
];

/** Configurations d'autres hébergeurs, qui feraient double emploi. */
const CONFIGS_CONCURRENTES = ["vercel.json", "netlify.toml", "firebase.json", "now.json"];

describe("configuration de déploiement", () => {
  it("ne garde qu'une source pour les en-têtes servis", () => {
    const doublons = CONFIGS_CONCURRENTES.filter((f) => fs.existsSync(path.join(RACINE, f)));
    expect(
      doublons,
      "ces fichiers redéclarent une configuration que Cloudflare ne lit pas"
    ).toEqual([]);
  });

  it("déclare bien les cinq en-têtes de sécurité là où ils sont lus", () => {
    const chemin = path.join(RACINE, "public/_headers");
    expect(fs.existsSync(chemin), "public/_headers est le fichier que Cloudflare lit").toBe(true);

    const contenu = fs.readFileSync(chemin, "utf8");
    for (const entete of EN_TETES_SECURITE) {
      expect(contenu, `${entete} doit être déclaré`).toContain(entete);
    }
  });

  it("garde la réécriture de l'application monopage", () => {
    // Sans elle, toute route ouverte directement rend une page introuvable.
    const chemin = path.join(RACINE, "public/_redirects");
    expect(fs.existsSync(chemin), "public/_redirects porte la réécriture").toBe(true);
    expect(fs.readFileSync(chemin, "utf8")).toContain("/index.html");
  });
});
