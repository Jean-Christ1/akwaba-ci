import { afterEach, describe, expect, it, vi } from "vitest";

import { searchConsole } from "@/modules/admin/search";

/**
 * Chercher quelqu'un par son adresse courriel.
 *
 * La recherche de la console le disait elle-même en commentaire : « une adresse
 * ne se cherche que là où l'application en conserve », c'est-à-dire dans les
 * demandes de visiteur. La table des comptes d'authentification n'est pas
 * exposée au navigateur.
 *
 * Conséquence : quelqu'un qui s'était inscrit sans jamais remplir de formulaire
 * était introuvable par son adresse, et un exploitant qui reçoit un appel n'a
 * souvent que cela. `annuaire_des_comptes` lit la table des comptes côté
 * serveur, réservé au droit « utilisateurs.lire ».
 */

const COMPTE = {
  user_id: "11111111-1111-1111-1111-111111111111",
  courriel: "konan@exemple.ci",
  nom_affiche: "Konan Yao",
  telephone: "0709887766",
  cree_le: "2026-03-04T10:00:00Z",
  suspendu_le: null,
  suspendu_motif: null,
  suspendu_par_courriel: null,
  roles: [],
  courses: 3,
};

const DEMANDE = {
  email: "konan@exemple.ci",
  full_name: "Konan (formulaire)",
  phone: "0700000000",
  user_id: null,
};

function servir({ annuaire, demandes }: { annuaire: unknown; demandes: unknown }) {
  vi.spyOn(globalThis, "fetch").mockImplementation((async (entree: RequestInfo | URL) => {
    const url = typeof entree === "string" ? entree : entree.toString();
    if (url.includes("annuaire_des_comptes")) {
      if (annuaire === "refus") {
        return new Response(
          JSON.stringify({ message: "Vous n'avez pas le droit de consulter les comptes." }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify(annuaire), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("leads")) {
      return new Response(JSON.stringify(demandes), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chercher par adresse courriel", () => {
  it("trouve un compte qui n'a jamais rempli de formulaire", async () => {
    servir({ annuaire: [COMPTE], demandes: [] });
    const r = await searchConsole("konan@exemple.ci");

    expect(r.users).toHaveLength(1);
    expect(r.users[0]).toMatchObject({
      userId: COMPTE.user_id,
      email: "konan@exemple.ci",
      displayName: "Konan Yao",
      source: "compte",
    });
  });

  it("le compte prime sur ce qui a été saisi dans un formulaire", async () => {
    // La même adresse des deux côtés : le nom du compte fait foi, celui du
    // formulaire ayant pu être saisi par n'importe qui.
    servir({ annuaire: [COMPTE], demandes: [DEMANDE] });
    const r = await searchConsole("konan@exemple.ci");

    expect(r.users).toHaveLength(1);
    expect(r.users[0].displayName).toBe("Konan Yao");
    expect(r.users[0].userId).toBe(COMPTE.user_id);
  });

  it("un refus de l'annuaire ne casse pas la recherche", async () => {
    // L'annuaire est réservé à « utilisateurs.lire ». Qui ne l'a pas doit
    // continuer de chercher dans ce qu'il a le droit de lire, plutôt que de
    // voir la recherche entière échouer.
    servir({ annuaire: "refus", demandes: [DEMANDE] });
    const r = await searchConsole("konan@exemple.ci");

    expect(r.users).toHaveLength(1);
    expect(r.users[0].source).toBe("demande");
    expect(r.users[0].displayName).toBe("Konan (formulaire)");
  });

  it("rend une liste vide plutôt qu'une erreur quand personne ne correspond", async () => {
    servir({ annuaire: [], demandes: [] });
    const r = await searchConsole("inconnu@exemple.ci");

    expect(r.users).toEqual([]);
    expect(r.error).toBeNull();
  });
});
