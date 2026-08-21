import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { formatFcfa } from "@/modules/errands/domain";
import { courseDepuisMarcheOuvert } from "@/modules/errands/application/useErrandDetail";
import { accesShopper, messageOffreInvalide } from "@/modules/errands/marche";
import { CarteMission } from "@/pages/courses/RunnerDashboardPage";

/**
 * Le marché du shopper : quatre défauts constatés sur l'écran des missions.
 *
 * 1. « Ouvrir » une mission du marché menait toujours à « Course introuvable ».
 *    La table errands n'est lisible que par le client, le shopper assigné et le
 *    personnel ; une course ouverte n'a pas encore de shopper, donc la requête
 *    ne rendait aucune ligne, sans erreur, et l'écran concluait à l'absence.
 * 2. Une offre envoyée sans prix s'affichait « 0 FCFA » au client, qui se
 *    voyait ensuite facturer le plancher du barème.
 * 3. Reproposer une offre affichait le message brut de la base, nom de la
 *    contrainte unique compris.
 * 4. Un shopper suspendu perdait l'accès à ses missions en cours, que le
 *    serveur l'autorise pourtant toujours à faire avancer.
 *
 * Les contrôles de structure lisent le code source et les migrations. Ils ne
 * remplacent pas un parcours réel, mais ils sont le seul moyen de verrouiller
 * un enchaînement de requêtes sans simuler la base, ce que ce dépôt s'interdit.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const lire = (relatif: string) => fs.readFileSync(path.join(RACINE, relatif), "utf8");

const SOURCE_HOOK = "src/modules/errands/application/useErrandDetail.ts";
const SOURCE_PAGE = "src/pages/courses/RunnerDashboardPage.tsx";

/** Colonnes que la vue du marché publie vraiment, lues dans la migration en vigueur. */
function colonnesDuMarcheOuvert(): Set<string> {
  const dossier = path.join(RACINE, "supabase/migrations");
  let definition: string | null = null;

  for (const fichier of fs.readdirSync(dossier).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = fs.readFileSync(path.join(dossier, fichier), "utf8");
    const trouve = sql.match(
      /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+public\.open_errands_feed[\s\S]*?FROM\s+public\.errands/i
    );
    // La dernière migration qui la définit fait foi : les précédentes racontent
    // l'histoire du dépôt, pas l'état de la base.
    if (trouve) definition = trouve[0];
  }

  expect(definition, "aucune migration ne définit la vue open_errands_feed").toBeTruthy();
  return new Set([...(definition ?? "").matchAll(/\be\.([a-z_]+)/g)].map((m) => m[1]));
}

/** Ligne du marché ouvert telle que la vue la rend : ni client, ni adresse, ni notes. */
const LIGNE_MARCHE = {
  id: "6f3b2d18-9c04-4a7e-8b51-2d7c4e6f9a03",
  title: "Courses du samedi au supermarché",
  category: "grocery" as const,
  city: "Abidjan",
  zone: "Cocody",
  budget_estimate: 25000,
  service_fee: 3000,
  delivery_fee: 1500,
  total_amount: 29950,
  runner_payout: 3825,
  distance_km: 6.4,
  estimated_minutes: 75,
  vehicle_required: "moto",
  volume_size: "medium",
  urgency: "standard",
  dropoff_mode: "runner_delivers" as const,
  fund_mode: "customer_advance" as const,
  items: [{ label: "Riz parfumé 5 kg", qty: "1" }],
  scheduled_for: null,
  created_at: "2026-08-19T09:30:00.000Z",
};

describe("ouvrir une mission du marché ouvert", () => {
  it("ne lit que des colonnes réellement publiées par la vue", () => {
    const publiees = colonnesDuMarcheOuvert();
    const source = lire(SOURCE_HOOK);

    const debut = source.indexOf("export function courseDepuisMarcheOuvert");
    expect(debut, "le hook ne sait pas reconstituer une course du marché").toBeGreaterThan(-1);

    // Le corps s'arrête à la première accolade fermante en colonne zéro :
    // l'objet retourné, lui, est indenté.
    const corps = source.slice(debut, source.indexOf(String.fromCharCode(10) + "}", debut));
    const lues = [...new Set([...corps.matchAll(/ligne\.([a-z_]+)/g)].map((m) => m[1]))];

    expect(lues.length, "la reconstitution ne lit aucune colonne").toBeGreaterThan(0);
    expect(
      lues.filter((c) => !publiees.has(c)),
      "ces colonnes sont lues alors que la vue ne les publie pas : elles arriveront vides"
    ).toEqual([]);
  });

  it("reconstitue une course ouverte, sans shopper et sans donnée réservée aux parties", () => {
    const course = courseDepuisMarcheOuvert(LIGNE_MARCHE);

    expect(course.id).toBe(LIGNE_MARCHE.id);
    expect(course.title).toBe(LIGNE_MARCHE.title);
    expect(course.budget_estimate).toBe(25000);
    // La vue ne retient que les courses ouvertes et sans affectation.
    expect(course.status).toBe("open");
    expect(course.runner_id).toBeNull();
    // La promesse produit : l'adresse exacte et les notes n'apparaissent qu'une
    // fois la course attribuée. Le marché ne les publie pas, la reconstitution
    // ne doit donc rien inventer.
    expect(course.delivery_address).toBeNull();
    expect(course.notes).toBeNull();
  });

  it("interroge le marché ouvert avant de conclure qu'une course n'existe pas", () => {
    const source = lire(SOURCE_HOOK);

    const marche = source.indexOf('from("open_errands_feed")');
    const absence = source.indexOf("setErrand(null)");

    expect(marche, "le hook n'interroge jamais le marché ouvert").toBeGreaterThan(-1);
    expect(
      marche,
      "l'absence est écrite avant d'avoir demandé la course au marché ouvert : " +
        "toute mission ouverte s'affichera « Course introuvable »"
    ).toBeLessThan(absence);
  });
});

describe("prix d'une offre", () => {
  // Le barème de repli du moteur tarifaire ; le serveur peut en servir un autre,
  // la fonction reçoit donc toujours le plancher en vigueur.
  const PLANCHER = 1000;

  it("refuse un envoi sans prix, ce qui valait zéro et passait", () => {
    const message = messageOffreInvalide("", PLANCHER);
    expect(message).toBeTruthy();
    expect(message).toContain(formatFcfa(PLANCHER));
  });

  it("refuse un prix nul", () => {
    expect(messageOffreInvalide("0", PLANCHER)).toBeTruthy();
  });

  it("refuse un prix sous le plancher, que le client paierait quand même", () => {
    const message = messageOffreInvalide("500", PLANCHER);
    expect(message).toBeTruthy();
    expect(message).toContain(formatFcfa(PLANCHER));
  });

  it("accepte le plancher et au-dessus", () => {
    expect(messageOffreInvalide("1000", PLANCHER)).toBeNull();
    expect(messageOffreInvalide("3000", PLANCHER)).toBeNull();
  });

  it("n'annonce pas un prix qui ne serait pas celui appliqué", () => {
    const page = lire(SOURCE_PAGE);
    // L'insertion partait avec Number(price) || 0. Le repli à zéro a disparu :
    // c'est la garde qui décide, pas une valeur de secours.
    expect(page).not.toContain("Number(price) || 0");
  });
});

describe("offre déjà envoyée", () => {
  const mission = {
    id: LIGNE_MARCHE.id,
    title: LIGNE_MARCHE.title,
    category: LIGNE_MARCHE.category,
    city: LIGNE_MARCHE.city,
    zone: LIGNE_MARCHE.zone,
    budget_estimate: LIGNE_MARCHE.budget_estimate,
    status: "open" as const,
    created_at: LIGNE_MARCHE.created_at,
    runner_id: null,
  };

  const afficher = (offreEnvoyee: boolean) =>
    render(
      <MemoryRouter>
        <ul>
          <CarteMission mission={mission} avecOffre offreEnvoyee={offreEnvoyee} />
        </ul>
      </MemoryRouter>
    );

  it("remplace le bouton par « Offre envoyée », au lieu de proposer un doublon refusé", () => {
    afficher(true);

    const bouton = screen.getByRole("button", { name: "Offre envoyée" });
    expect(bouton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Proposer une offre" })).toBeNull();
  });

  it("laisse proposer une offre quand il n'y en a pas encore", () => {
    afficher(false);

    expect(screen.getByRole("button", { name: "Proposer une offre" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Offre envoyée" })).toBeNull();
  });

  it("traduit le refus de doublon avant de retomber sur le message de la base", () => {
    const page = lire(SOURCE_PAGE);

    const doublon = page.indexOf('"23505"');
    const messageBrut = page.indexOf("toast.error(error.message)");

    expect(doublon, "le refus de doublon n'est pas traité").toBeGreaterThan(-1);
    expect(
      doublon,
      "le message brut de la base part avant la traduction : le shopper lit le nom " +
        "de la contrainte errand_offers_errand_id_runner_id_key"
    ).toBeLessThan(messageBrut);
  });
});

describe("accès d'un shopper selon l'état de son dossier", () => {
  it("garde ses missions en cours à un shopper suspendu", () => {
    const acces = accesShopper("suspended");

    // Le serveur l'autorise toujours à faire avancer sa course, et un client
    // attend sa livraison au bout.
    expect(acces.mesMissions).toBe(true);
    expect(acces.marcheOuvert).toBe(false);
    expect(acces.candidature).toBe(false);
    expect(acces.bandeau).toBeTruthy();
    expect(acces.bandeau).toMatch(/suspendu/i);
  });

  it("garde ses missions à une candidature en attente ou refusée", () => {
    for (const statut of ["pending", "rejected"]) {
      const acces = accesShopper(statut);
      expect(acces.mesMissions, statut).toBe(true);
      expect(acces.marcheOuvert, statut).toBe(false);
      expect(acces.bandeau, statut).toBeTruthy();
    }
  });

  it("ouvre le marché au seul shopper validé, sans rien lui signaler", () => {
    const acces = accesShopper("approved");

    expect(acces.marcheOuvert).toBe(true);
    expect(acces.mesMissions).toBe(true);
    expect(acces.bandeau).toBeNull();
  });

  it("invite à candidater qui n'a pas de dossier, et ne conclut rien avant de l'avoir lu", () => {
    expect(accesShopper(null).candidature).toBe(true);

    const enAttente = accesShopper(undefined);
    expect(enAttente.candidature).toBe(false);
    expect(enAttente.bandeau).toBeNull();
    expect(enAttente.marcheOuvert).toBe(false);
  });

  it("ne fait dépendre de la validation que la lecture du marché ouvert", () => {
    const page = lire(SOURCE_PAGE);

    expect(page, "les missions du shopper ne sont plus chargées").toContain(
      '.eq("runner_id", user.id)'
    );

    const conditionnees = [
      ...page.matchAll(/acces\.marcheOuvert\s*\?\s*supabase\s*\.?\s*from\("([a-z_]+)"\)/g),
    ].map((m) => m[1]);

    expect(
      conditionnees.length,
      "plus rien ne distingue le marché ouvert du reste : la garde d'approbation a disparu"
    ).toBeGreaterThan(0);
    expect(
      conditionnees.filter((t) => t !== "open_errands_feed" && t !== "errand_offers"),
      "ces lectures sont abandonnées faute de validation alors qu'elles ne relèvent " +
        "pas du marché ouvert : le shopper suspendu y perd ses courses en cours"
    ).toEqual([]);
    // Rien ne doit interrompre le chargement sur la seule absence de marché.
    expect(page).not.toMatch(/if \(!acces\.marcheOuvert\) return/);
    // Le bandeau d'explication doit être posé au-dessus des listes.
    expect(page).toContain("{acces.bandeau}");
  });
});
