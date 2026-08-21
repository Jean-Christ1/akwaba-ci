import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Santé structurelle du dépôt.
 *
 * Plusieurs contributeurs et plusieurs outils écrivent dans ce projet, ce qui
 * produit mécaniquement des doublons : deux composants qui font la même chose
 * sans se connaître, un fichier laissé en place et jamais branché, un lien vers
 * une route qui n'existe plus. Rien de cela ne casse la compilation, donc rien
 * ne le signale, et l'application s'alourdit sans que personne ne le voie.
 *
 * Ces contrôles ont trouvé un composant de bascule créé en août et jamais
 * branché, doublon de celui de l'accueil, et un hook dormant depuis mai.
 */

const RACINE = path.resolve(__dirname, "../..");
const norm = (p: string) => p.split(path.sep).join("/");

// Le contenu est lu une seule fois : relire chaque fichier pour chaque autre
// revient à des milliers de lectures, et le contrôle dépassait son délai avant
// d'avoir rien prouvé.
const CACHE = new Map<string, string>();
const lire = (p: string): string => {
  const connu = CACHE.get(p);
  if (connu !== undefined) return connu;
  const contenu = fs.readFileSync(path.join(RACINE, p), "utf8");
  CACHE.set(p, contenu);
  return contenu;
};

const lister = (dossier: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(path.join(RACINE, dossier), { withFileTypes: true })) {
    const rel = norm(path.join(dossier, e.name));
    if (e.isDirectory()) lister(rel, acc);
    else if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) acc.push(rel);
  }
  return acc;
};

const FICHIERS = lister("src");
const estTest = (f: string) => f.includes(".test.");

// Fichiers légitimement sans import : la configuration les désigne autrement.
const SANS_IMPORT_ATTENDU = [
  "src/main.tsx",
  "src/App.tsx",
  "src/test/setup.ts",
  "src/vite-env.d.ts",
];

describe("santé structurelle", () => {
  it("aucun composant ni hook n'est laissé sans emploi", () => {
    const morts: string[] = [];

    // Comparer chaque fichier à tous les autres revient à parcourir le dépôt
    // autant de fois qu'il compte de fichiers. On concatène une fois, et
    // chaque recherche devient immédiate.
    const candidats = FICHIERS.filter(
      (f) => !estTest(f) && !f.includes("/components/ui/") && !SANS_IMPORT_ATTENDU.includes(f)
    );
    const toutLeCode = FICHIERS.map((f) => lire(f)).join(String.fromCharCode(10));

    for (const f of candidats) {
      const nom = path.basename(f).replace(".tsx", "").replace(".ts", "");

      // Le nom est cherché tel qu'il apparaît dans un chemin d'import, entre
      // un séparateur et une fin de chemin. Le chercher nu laissait passer les
      // noms courants : « Index » se retrouve dans tabIndex, zIndex et indexOf,
      // si bien qu'une page morte nommée Index.tsx paraissait citée partout.
      const cite = new RegExp('[/"\'`]' + nom + '["\'`/]', "g");

      // Le fichier se nomme lui-même dans son propre contenu : on retranche
      // ses occurrences propres avant de conclure qu'il est cité ailleurs.
      const propres = (lire(f).match(cite) ?? []).length;
      const total = (toutLeCode.match(cite) ?? []).length;
      if (total <= propres) morts.push(f);
    }

    expect(
      morts,
      "ces fichiers ne sont importés nulle part : à brancher ou à supprimer"
    ).toEqual([]);
  });

  it("aucun lien ne mène vers une route inexistante", () => {
    const app = lire("src/App.tsx");
    const routes = [...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
    const casses = new Set<string>();

    for (const f of FICHIERS) {
      if (estTest(f)) continue;
      for (const m of lire(f).matchAll(new RegExp('to="(/[^"?#]*)', "g"))) {
        let cible = m[1];
        if (cible.length > 1 && cible.endsWith("/")) cible = cible.slice(0, -1);

        const existe = routes.some((r) => {
          if (r === "*") return false;
          return new RegExp("^" + r.replace(/:[^/]+/g, "[^/]+") + "$").test(cible);
        });
        if (!existe) casses.add(cible + " (" + f + ")");
      }
    }

    expect([...casses], "un lien mort ressemble à une fonctionnalité absente").toEqual([]);
  });

  it("aucune route déclarée n'est laissée sans porte d'entrée", () => {
    const app = lire("src/App.tsx");
    const routes = [...app.matchAll(new RegExp('path="([^"]+)"', "g"))].map((m) => m[1]);

    // Routes atteintes autrement que par un lien de l'interface : adresse
    // saisie, courriel, redirection après connexion, ou lien profond porté
    // par un paramètre. Toute entrée ajoutée ici doit être justifiée.
    const ENTREES = [
      "/",
      "*",
      "/auth",
      "/onboarding",
      "/reset-password",
      "/admin/bootstrap",
    ];

    const liens = FICHIERS.filter((f) => !estTest(f) && f !== "src/App.tsx")
      .map((f) => lire(f))
      .join(String.fromCharCode(10));

    const orphelines = routes.filter((r) => {
      if (ENTREES.includes(r)) return false;
      // Une route à paramètre se construit, elle ne s'écrit pas telle quelle :
      // on cherche son préfixe fixe.
      const prefixe = r.split("/:")[0];
      return !liens.includes('"' + prefixe) && !liens.includes("`" + prefixe);
    });

    // Une route que rien n'ouvre est une page que personne ne verra : elle
    // sera livrée, chargée, maintenue, et jamais atteinte.
    expect(orphelines, "routes sans aucun lien entrant").toEqual([]);
  });

  it("chaque appel serveur correspond à une fonction déclarée", () => {
    const types = lire("src/integrations/supabase/types.ts");
    const appels = new Set<string>();

    for (const f of FICHIERS) {
      for (const m of lire(f).matchAll(new RegExp('[.]rpc[(][ ]*"([a-z_]+)"', "g"))) {
        appels.add(m[1]);
      }
    }

    const inconnus = [...appels].filter(
      (r) => !new RegExp("^      " + r + ":", "m").test(types)
    );
    expect(inconnus, "fonctions appelées sans être déclarées dans les types").toEqual([]);
  });

  it("chaque table ou vue interrogée est déclarée", () => {
    const types = lire("src/integrations/supabase/types.ts");
    const tables = new Set<string>();

    for (const f of FICHIERS) {
      for (const m of lire(f).matchAll(new RegExp('[.]from[(][ ]*"([a-z_]+)"', "g"))) {
        tables.add(m[1]);
      }
    }

    const inconnues = [...tables].filter(
      (t) => !new RegExp("^      " + t + ": ", "m").test(types)
    );
    expect(inconnues, "tables interrogées sans être déclarées").toEqual([]);
  });

  it("une seule bascule d'univers existe dans le dépôt", () => {
    // Deux composants de bascule ont cohabité, dont un jamais branché. Deux
    // réponses à la même question finissent toujours par diverger.
    const bascules = FICHIERS.filter((f) => {
      if (estTest(f)) return false;
      const code = lire(f);
      return code.includes('role="tablist"') && code.includes("couvrir");
    });

    expect(bascules.length, "bascules : " + bascules.join(", ")).toBeLessThanOrEqual(1);
  });
});
