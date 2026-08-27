import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Aucune dépendance à Lovable, nulle part.
 *
 * Le frontend en avait été purgé, mais trois fonctions serveur faisaient encore
 * transiter leurs courriels par `connector-gateway.lovable.dev`, avec un
 * expéditeur de démonstration. Le nettoyage d'un côté avait laissé croire que
 * l'autre l'était aussi.
 *
 * Ce contrôle lit les sources plutôt que le paquet construit : c'est là que la
 * dépendance revient si elle revient.
 */

const RACINE = path.resolve(__dirname, "..", "..");

function fichiersSources(dossier: string): string[] {
  const entrees = fs.readdirSync(dossier, { withFileTypes: true });
  return entrees.flatMap((e) => {
    const complet = path.join(dossier, e.name);
    if (e.isDirectory()) return e.name === "node_modules" ? [] : fichiersSources(complet);
    return /\.(ts|tsx|js|mjs|html|json)$/.test(e.name) ? [complet] : [];
  });
}

describe("aucune dépendance à Lovable", () => {
  // Ce fichier cite les motifs qu'il interdit : il s'exclut de son propre
  // balayage, sinon il se declarerait fautif.
  const sources = [
    ...fichiersSources(path.join(RACINE, "src")),
    ...fichiersSources(path.join(RACINE, "supabase", "functions")),
    path.join(RACINE, "index.html"),
  ].filter((f) => path.resolve(f) !== path.resolve(__filename));

  it("ne mentionne Lovable dans aucune source", () => {
    const fautifs = sources.filter((f) =>
      /lovable/i.test(fs.readFileSync(f, "utf8"))
    );
    expect(fautifs.map((f) => path.relative(RACINE, f))).toEqual([]);
  });

  it("n'appelle aucune passerelle de connecteur extérieure", () => {
    const fautifs = sources.filter((f) =>
      /connector-gateway/i.test(fs.readFileSync(f, "utf8"))
    );
    expect(fautifs.map((f) => path.relative(RACINE, f))).toEqual([]);
  });

  it("n'expédie depuis aucun domaine de démonstration", () => {
    // « onboarding@resend.dev » est l'adresse de bac à sable de Resend. Un
    // message parti de là n'est pas un message d'Akwaba, et beaucoup de
    // messageries le classent en indésirable.
    const fautifs = sources.filter((f) =>
      /onboarding@resend\.dev/i.test(fs.readFileSync(f, "utf8"))
    );
    expect(fautifs.map((f) => path.relative(RACINE, f))).toEqual([]);
  });
});
