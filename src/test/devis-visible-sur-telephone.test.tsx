import fs from "node:fs";
import path from "node:path";

import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { AuthProvider } from "@/contexts/AuthContext";
import NewErrandPage from "@/pages/courses/NewErrandPage";

/**
 * Le prix doit rester visible pendant qu'on le fait changer.
 *
 * Le panneau du devis est une colonne latérale sur grand écran, et il se rend
 * après la totalité du formulaire. Constaté en pilotant l'application à 390
 * pixels de large : sur un téléphone, le client choisissait un véhicule, une
 * urgence, un volume, et ne découvrait l'effet sur le prix qu'après avoir
 * fait défiler cinq sections.
 *
 * Une barre fixe porte donc le montant et la publication en bas d'écran, au
 * dessus de la barre de navigation. Ce contrôle empêche qu'elle disparaisse à
 * la faveur d'un remaniement, et qu'on revienne sans s'en apercevoir à un prix
 * qui ne se voit qu'à la fin.
 */

const RACINE = path.resolve(__dirname, "..", "..");
const SOURCE = fs.readFileSync(
  path.join(RACINE, "src/pages/courses/NewErrandPage.tsx"),
  "utf8"
);

function afficher() {
  // La page lit les organisations de celui qui regarde : sans le fournisseur,
  // elle ne se monte pas. Le socle coupe le reseau, donc personne n'est
  // connecte, ce qui est l'etat d'un visiteur qui ouvre le formulaire.
  return render(
    <MemoryRouter>
      <AuthProvider>
        <NewErrandPage />
      </AuthProvider>
    </MemoryRouter>
  );
}

describe("le devis reste visible sur téléphone", { timeout: 30_000 }, () => {
  it("porte une barre de devis, nommée pour ceux qui n'y voient pas", () => {
    afficher();
    expect(
      screen.getByRole("region", { name: "Devis et publication" })
    ).toBeInTheDocument();
  });

  it("la barre ne double pas le panneau sur grand écran", () => {
    // Deux montants et deux boutons de publication côte à côte sur un écran
    // large seraient une hésitation, pas une aide : la colonne latérale suffit
    // dès que la place existe.
    const barre = SOURCE.slice(SOURCE.indexOf('aria-label="Devis et publication"'));
    const ouverture = SOURCE.lastIndexOf("<div", SOURCE.indexOf('aria-label="Devis et publication"'));
    const balise = SOURCE.slice(ouverture, ouverture + 400);
    expect(balise, "la barre doit disparaître à partir de lg").toContain("lg:hidden");
    expect(barre.length).toBeGreaterThan(0);
  });

  it("elle se place au-dessus de la barre de navigation, marge de sécurité comprise", () => {
    // Une barre posée à bottom-0 se glisserait sous la navigation, et le
    // bouton de publication deviendrait inatteignable au pouce.
    const ouverture = SOURCE.lastIndexOf("<div", SOURCE.indexOf('aria-label="Devis et publication"'));
    const balise = SOURCE.slice(ouverture, ouverture + 400);
    expect(balise).toContain("env(safe-area-inset-bottom)");
    expect(balise, "la barre ne doit pas toucher le bas de l'écran").not.toContain("bottom-0");
  });

  it("dit que le tarif est indisponible plutôt que d'inventer un montant", () => {
    // Le socle de test coupe le réseau : le barème n'arrive pas, et c'est
    // exactement l'état qu'il faut savoir rendre. Afficher zéro franc, ou un
    // montant de repli, annoncerait un prix que le serveur ne tiendrait pas.
    afficher();
    const barre = screen.getByRole("region", { name: "Devis et publication" });
    expect(barre).toHaveTextContent(/Tarif indisponible/);
  });
});
