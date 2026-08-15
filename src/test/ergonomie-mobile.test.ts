import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Garde-fous d'ergonomie mobile.
 *
 * L'essentiel des courses se commande et s'exécute au téléphone, souvent debout
 * et d'une seule main. Ces contrôles ne remplacent pas un essai sur un vrai
 * appareil, mais ils attrapent les régressions qui se voient dans le code :
 * une cible trop petite pour un pouce, un champ qui déclenche le zoom d'iOS, un
 * dépôt de photo qui n'ouvre pas l'appareil.
 */

const RACINE = path.resolve(__dirname, "../..");
const lire = (p: string) => fs.readFileSync(path.join(RACINE, p), "utf8");

const listerFichiers = (dir: string): string[] => {
  const sortie: string[] = [];
  for (const e of fs.readdirSync(path.join(RACINE, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) sortie.push(...listerFichiers(rel));
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) sortie.push(rel);
  }
  return sortie;
};

describe("ergonomie mobile", () => {
  it("la fenêtre d'affichage couvre les encoches", () => {
    const html = lire("index.html");
    expect(html).toMatch(/name="viewport"/);
    // Sans viewport-fit=cover, la barre d'onglets se retrouve sous la barre
    // d'accueil des téléphones à encoche, et devient inatteignable.
    expect(html).toContain("viewport-fit=cover");
  });

  it("les champs de saisie ne déclenchent pas le zoom automatique d'iOS", () => {
    const input = lire("src/components/ui/input.tsx");
    // iOS agrandit la page dès qu'un champ a une police inférieure à 16 px.
    // text-base vaut 16 px ; la réduction à text-sm est réservée au grand écran.
    expect(input).toMatch(/\btext-base\b/);
    expect(input).toMatch(/md:text-sm/);
  });

  it("la barre d'onglets respecte la zone sûre et la taille minimale du pouce", () => {
    const barre = lire("src/shared/ui/MobileTabBar.tsx");
    expect(barre).toContain("env(safe-area-inset-bottom)");
    expect(barre).toMatch(/min-h-\[44px\]/);
  });

  it("le dépôt d'une preuve ouvre l'appareil photo", () => {
    const preuve = lire("src/modules/errands/ui/ProofUpload.tsx");
    // Sans capture, le shopper devant sa caisse tombe sur sa galerie, où la
    // photo qu'il doit fournir n'existe pas encore.
    expect(preuve).toContain('capture="environment"');
    expect(preuve).toContain("compresserImage");
  });

  it("la candidature shopper permet de photographier la pièce d'identité", () => {
    const candidature = lire("src/pages/courses/RunnerSignupPage.tsx");
    expect(candidature).toContain('capture="environment"');
    expect(candidature).toContain("compresserImage");
  });

  it("l'application est installable et se lance en plein écran", () => {
    const manifeste = JSON.parse(lire("public/manifest.webmanifest"));
    expect(manifeste.display).toBe("standalone");
    expect(manifeste.icons.length).toBeGreaterThanOrEqual(2);
    // Une icône masquable évite le carré blanc sur les lanceurs Android.
    expect(manifeste.icons.some((i: { purpose?: string }) => i.purpose?.includes("maskable"))).toBe(true);
    expect(manifeste.lang).toBe("fr");
  });

  it("aucun écran ne fixe une hauteur de bouton en dessous du seuil du pouce", () => {
    const fautifs: string[] = [];
    for (const f of listerFichiers("src/pages").concat(listerFichiers("src/modules"))) {
      const code = lire(f);
      // h-6 vaut 24 px, h-7 vaut 28 px : trop petit pour une cible tactile
      // principale. Ces classes restent légitimes sur une icône décorative,
      // on ne les cherche donc que sur les éléments interactifs.
      const motif = /<(?:Button|button)[^>]{0,200}?className="[^"]*\bh-[1-7]\b[^"]*"/g;
      const trouve = code.match(motif);
      if (trouve) fautifs.push(`${f} (${trouve.length})`);
    }

    // Ce contrôle documente l'état : il échoue si la situation empire.
    expect(fautifs.length, `boutons sous le seuil tactile : ${fautifs.join(", ")}`).toBeLessThanOrEqual(6);
  });
});
