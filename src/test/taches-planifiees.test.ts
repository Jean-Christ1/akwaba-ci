import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Un mécanisme périodique sans déclencheur ne tombe jamais en panne : il ne
 * démarre simplement pas.
 *
 * Deux fonctions de bordure protégées par un secret partagé attendaient d'être
 * appelées périodiquement, et rien ne les appelait. Aucune erreur, aucune
 * alerte : les courses programmées ne repartaient pas et la file de
 * notifications ne se vidait pas. Le défaut s'est vu en interrogeant la base,
 * pas en lisant le code, parce qu'il n'y a rien à lire quand une chose manque.
 *
 * Ce contrôle rend l'omission impossible à répéter : toute fonction attendant
 * un appel périodique doit avoir son déclencheur déclaré dans une migration,
 * ou figurer ici avec la raison de son absence.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const FONCTIONS = path.join(RACINE, "supabase", "functions");
const MIGRATIONS = path.join(RACINE, "supabase", "migrations");

/**
 * Fonctions périodiques dont le déclencheur n'est pas un appel HTTP planifié,
 * avec la raison. Toute entrée ajoutée ici doit être justifiée : c'est une
 * dérogation, pas une case à cocher.
 */
const DEROGATIONS: Record<string, string> = {
  "run-schedules":
    "La tâche planifiée appelle directement errand_schedules_run_due, qui vit " +
    "dans la base. Cette fonction de bordure reste le point d'entrée externe, " +
    "manuel ou depuis un ordonnanceur tiers.",
};

function fonctionsPeriodiques(): string[] {
  return fs
    .readdirSync(FONCTIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .filter((nom) => {
      const index = path.join(FONCTIONS, nom, "index.ts");
      if (!fs.existsSync(index)) return false;
      return fs.readFileSync(index, "utf8").includes("x-cron-secret");
    });
}

function sqlDesMigrations(): string {
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => fs.readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join(String.fromCharCode(10));
}

describe("tâches périodiques : rien ne doit attendre un appel qui ne vient pas", () => {
  it("donne un déclencheur à chaque fonction attendant un appel périodique", () => {
    const sql = sqlDesMigrations();
    const periodiques = fonctionsPeriodiques();

    expect(periodiques.length, "aucune fonction périodique détectée").toBeGreaterThan(0);

    for (const nom of periodiques) {
      if (DEROGATIONS[nom]) continue;
      expect(
        sql.includes(nom),
        `la fonction « ${nom} » attend un appel périodique mais aucune migration ne le planifie`
      ).toBe(true);
    }
  });

  it("planifie les courses programmées, sinon la programmation est une promesse vide", () => {
    const sql = sqlDesMigrations();

    expect(sql).toContain("cron.schedule");
    expect(sql).toContain("akwaba-courses-programmees");
    expect(sql).toContain("errand_schedules_run_due");
  });

  it("n'écrit ni adresse de projet ni secret dans une migration", () => {
    const sql = sqlDesMigrations();

    // Une adresse de projet ou un secret inscrits dans une migration partent
    // dans l'historique Git et n'en sortent plus.
    expect(sql).not.toMatch(new RegExp("https://[a-z0-9]+[.]supabase[.]co"));
    expect(sql).not.toMatch(new RegExp("(eyJ|sbp_)[A-Za-z0-9_-]{20}"));
    expect(sql).toContain("vault.decrypted_secrets");
  });

  it("rend le dernier passage de chaque tâche visible au personnel", () => {
    const sql = sqlDesMigrations();

    // Une tâche arrêtée ne produit pas d'erreur, seulement une absence : elle
    // doit donc pouvoir se constater.
    expect(sql).toContain("public.taches_planifiees()");
    expect(sql).toContain("cron.job_run_details");
    expect(sql).toMatch(new RegExp("REVOKE ALL ON FUNCTION public[.]taches_planifiees[(][)] FROM PUBLIC, anon"));
  });
});
