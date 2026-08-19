import fs from "node:fs";
import path from "node:path";

import { FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { edgeErrorMessage, GENERIC_EDGE_ERROR_MESSAGE } from "@/shared/lib/edgeError";

/**
 * Les messages des fonctions de bordure doivent parvenir à l'utilisateur.
 *
 * Constat : un partenaire saisissait une description de huit caractères,
 * register-partner répondait 400 avec « Description invalide (10 à 4000
 * caractères). », et le bandeau affichait « Edge Function returned a non-2xx
 * status code ». Les cinq appelants faisaient `if (error) throw error` avant
 * de lire `data`, puis montraient `error.message`, qui ne porte que le libellé
 * de la classe. Le même écran masquait le 429 « Trop de fiches envoyées », les
 * refus de submit-lead et ceux de bootstrap-admin.
 */

const RACINE = path.resolve(__dirname, "../..");
const LIBELLE_CLASSE = "Edge Function returned a non-2xx status code";

const reponse = (corps: string, status = 400) =>
  new Response(corps, { status, headers: { "Content-Type": "application/json" } });

describe("extraction du message d'une fonction de bordure", () => {
  it("rend le motif écrit par la fonction quand le corps est un JSON avec un champ error", async () => {
    const attendu = "Description invalide (10 à 4000 caractères).";
    const erreur = new FunctionsHttpError(reponse(JSON.stringify({ error: attendu })));

    expect(await edgeErrorMessage(erreur)).toBe(attendu);
  });

  it("rend aussi le motif d'un refus de quota", async () => {
    const attendu = "Trop de fiches envoyées. Réessayez plus tard.";
    const erreur = new FunctionsHttpError(reponse(JSON.stringify({ error: attendu }), 429));

    expect(await edgeErrorMessage(erreur)).toBe(attendu);
  });

  it("retombe sur un message générique quand le corps n'est pas lisible", async () => {
    // Une passerelle en panne répond du HTML, pas le json({ error }) de nos
    // fonctions : rien d'utilisable, et surtout rien à montrer.
    const erreur = new FunctionsHttpError(reponse("<html><body>502 Bad Gateway</body></html>", 502));

    expect(await edgeErrorMessage(erreur)).toBe(GENERIC_EDGE_ERROR_MESSAGE);
  });

  it("retombe sur le message générique quand le corps a déjà été consommé", async () => {
    const r = reponse(JSON.stringify({ error: "Motif" }));
    await r.text();

    expect(await edgeErrorMessage(new FunctionsHttpError(r))).toBe(GENERIC_EDGE_ERROR_MESSAGE);
  });

  it("ne laisse pas fuir la trace d'une erreur ordinaire", async () => {
    const erreur = new Error("TypeError: Cannot read properties of undefined (reading 'id')");

    expect(await edgeErrorMessage(erreur)).toBe(GENERIC_EDGE_ERROR_MESSAGE);
  });

  it("supporte une erreur nulle", async () => {
    expect(await edgeErrorMessage(null)).toBe(GENERIC_EDGE_ERROR_MESSAGE);
    expect(await edgeErrorMessage(undefined)).toBe(GENERIC_EDGE_ERROR_MESSAGE);
  });

  it("n'affiche jamais le libellé de classe du client Supabase", async () => {
    // C'est exactement ce que voyait le partenaire avant la correction.
    const cas: unknown[] = [
      new FunctionsHttpError(reponse("pas du json", 500)),
      new FunctionsRelayError(reponse("", 500)),
      new Error(LIBELLE_CLASSE),
      null,
    ];

    for (const erreur of cas) {
      expect(await edgeErrorMessage(erreur)).not.toContain(LIBELLE_CLASSE);
    }
  });

  it("refuse un corps qui porte une trace technique multiligne", async () => {
    const trace =
      "Error: boom" + String.fromCharCode(10) + "    at Server.handler (file:///index.ts:12:9)";
    const erreur = new FunctionsHttpError(reponse(JSON.stringify({ error: trace }), 500));

    expect(await edgeErrorMessage(erreur)).toBe(GENERIC_EDGE_ERROR_MESSAGE);
  });

  it("lit aussi une erreur de relais, qui porte également la réponse", async () => {
    const attendu = "Erreur serveur";
    const erreur = new FunctionsRelayError(reponse(JSON.stringify({ error: attendu }), 500));

    expect(await edgeErrorMessage(erreur)).toBe(attendu);
  });
});

describe("branchement des appelants", () => {
  const APPELANTS = [
    "src/pages/PartnerSignupPage.tsx",
    "src/modules/leads/ui/LeadRequestForm.tsx",
    "src/pages/admin/BootstrapAdminPage.tsx",
    "src/modules/admin/ModerationTab.tsx",
    "src/modules/admin/EmailProbe.tsx",
  ];

  // La relance tient sur une seule ligne : on la relève telle qu'elle est
  // écrite, plutôt que de chercher une sous-chaîne qui laisserait passer une
  // variante.
  const RELANCE_ATTENDUE = "if (error) throw new Error(await edgeErrorMessage(error));";

  it("aucun appelant ne relance l'erreur brute de la fonction de bordure", () => {
    // Seule la relance qui suit l'appel est en cause : PartnerSignupPage lève
    // aussi l'erreur d'inscription du compte, qui ne vient pas de la bordure.
    const releve = APPELANTS.map((f) => {
      const code = fs.readFileSync(path.join(RACINE, f), "utf8");
      const apres = code.slice(code.indexOf("supabase.functions.invoke"));
      return f + " :: " + (apres.match(/if \(error\) throw [^\r\n]*/)?.[0] ?? "aucune relance");
    });

    expect(
      releve,
      "ces écrans réafficheraient le libellé de classe au lieu du motif du refus"
    ).toEqual(APPELANTS.map((f) => f + " :: " + RELANCE_ATTENDUE));
  });
});

describe("contrainte de longueur de la description partenaire", () => {
  it("le formulaire reprend les bornes appliquées par register-partner", () => {
    // Les bornes viennent de requiredText(p.description, 10, 4000) : les lire
    // dans la fonction évite qu'une valeur inventée diverge de la règle serveur.
    const validation = fs.readFileSync(
      path.join(RACINE, "supabase/functions/register-partner/validate.ts"),
      "utf8"
    );
    const bornes = validation.match(/requiredText\(p\.description,\s*(\d+),\s*(\d+)\)/);
    expect(bornes, "la borne serveur a changé de forme").not.toBeNull();

    const page = fs.readFileSync(path.join(RACINE, "src/pages/PartnerSignupPage.tsx"), "utf8");
    expect(page).toContain("const DESCRIPTION_MIN = " + bornes![1] + ";");
    expect(page).toContain("const DESCRIPTION_MAX = " + bornes![2] + ";");
  });

  it("la description trop courte est arrêtée avant l'appel réseau", () => {
    const page = fs.readFileSync(path.join(RACINE, "src/pages/PartnerSignupPage.tsx"), "utf8");
    const avantAppel = page.slice(0, page.indexOf("supabase.functions.invoke"));

    expect(
      avantAppel,
      "sans contrôle local, huit caractères font un aller-retour serveur pour rien"
    ).toContain("description.length < DESCRIPTION_MIN");
  });
});
