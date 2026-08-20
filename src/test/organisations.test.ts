import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { gereLOrganisation } from "@/pages/OrganisationsPage";

/**
 * Les comptes entreprises.
 *
 * Ce qu'une organisation partage doit être exactement ce qui doit l'être. Le
 * point sensible n'est pas l'écran mais ce qu'il ne montre pas : l'adresse de
 * remise et les notes du client sont lisibles colonne par colonne dès que la
 * ligne de course l'est, donc élargir la visibilité des courses aurait donné à
 * un collègue l'adresse personnelle d'un autre.
 *
 * Ces contrôles portent sur ce qui se vérifie sans base : la règle de gestion,
 * et la forme de la migration là où elle décide de ce qui est exposé. Le reste
 * est éprouvé contre la vraie base par scripts/recette-organisations.mjs, qui
 * passe 17 étapes dont les refus attendus.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const MIGRATION = path.join(
  RACINE,
  "supabase/migrations/20260820100000_f7a3c9e5-4b28-4d16-9147-6e2b8d5c3a91.sql"
);
const sql = fs.readFileSync(MIGRATION, "utf8");

describe("qui gère une organisation", () => {
  it("reconnaît le propriétaire et le responsable", () => {
    expect(gereLOrganisation("owner")).toBe(true);
    expect(gereLOrganisation("manager")).toBe(true);
  });

  it("refuse le membre ordinaire et celui qui n'appartient à rien", () => {
    // Un non-membre n'a pas de rôle. C'est exactement le cas qui, côté base,
    // faisait rendre l'inconnu à la comparaison et laissait la garde muette.
    expect(gereLOrganisation("member")).toBe(false);
    expect(gereLOrganisation(undefined)).toBe(false);
  });
});

describe("ce que la migration expose, et ce qu'elle retient", () => {
  it("ne rend jamais l'adresse ni les notes dans le suivi d'organisation", () => {
    const debut = sql.indexOf("CREATE OR REPLACE FUNCTION public.organisation_errands");
    expect(debut).toBeGreaterThan(-1);
    const corps = sql.slice(debut, sql.indexOf("$fn$;", debut));

    for (const interdite of ["delivery_address", "notes", "handover_code", "third_party_contact"]) {
      expect(corps, `le suivi ne doit pas porter ${interdite}`).not.toContain(interdite);
    }
  });

  it("n'élargit pas la politique de lecture des courses", () => {
    // Le jour où quelqu'un ajoutera l'organisation à « Errand visibility »,
    // toutes les colonnes de la course suivront, adresse comprise.
    expect(sql).not.toContain("Errand visibility");
  });

  it("retire le code d'adhésion des colonnes lisibles", () => {
    // Qui lit le code entre dans l'organisation : il ne peut pas être une
    // colonne comme les autres.
    const grant = sql.match(/GRANT SELECT \(([^)]+)\)\s+ON public\.organisations/);
    expect(grant, "le GRANT colonne par colonne est attendu").not.toBeNull();
    expect(grant?.[1]).not.toContain("join_code");
  });

  it("nomme le cas du non-membre dans chaque garde de rôle", () => {
    // `role NOT IN (...)` rend l'inconnu quand le rôle est nul, et l'inconnu
    // n'est pas vrai : la garde ne se déclenchait pas.
    // Aucune garde ne doit ouvrir sur la comparaison seule : le cas nul est
    // nomme d'abord, sur la meme ligne ou juste au-dessus.
    const nues = sql
      .split(String.fromCharCode(10))
      .filter((ligne) => ligne.includes("IF v_moi NOT IN"));
    expect(nues, "une garde ne nomme pas le cas du non-membre").toEqual([]);
    const nommees = sql.split("v_moi IS NULL").length - 1;
    expect(nommees).toBeGreaterThanOrEqual(3);
  });

  it("garde toujours un propriétaire à l'organisation", () => {
    // Une organisation sans propriétaire ne se gère plus du tout : ni rôle, ni
    // membre, ni code.
    const occurrences = sql.split("doit garder au moins un propriétaire").length - 1;
    expect(occurrences).toBe(2);
  });

  it("ne rattache pas une course déjà en route", () => {
    // L'apostrophe est doublee dans une chaine SQL : on cherche le fragment
    // qui n'en porte pas.
    expect(sql).toContain("Une course déjà attribuée ne change plus d");
  });
});
