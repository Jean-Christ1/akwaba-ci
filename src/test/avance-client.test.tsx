import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { formatFcfa } from "@/modules/errands/domain";
import { AdvancePanel } from "@/modules/errands/ui/AdvancePanel";
import { AdvanceReceiptCard } from "@/modules/errands/ui/AdvanceReceiptCard";

/**
 * L'avance : ce que le client déclare, et ce que le shopper reconnaît.
 *
 * Les deux montants ont été confondus, et la fonction serveur qui inscrit le
 * montant reçu n'était appelée par aucun écran. Le client voyait donc
 * « vous avez déclaré un envoi de 0 FCFA » dès qu'il déposait sa preuve, puis
 * sa facture lui redemandait une somme déjà versée. Rien n'échouait : les deux
 * écrans s'affichaient normalement.
 */

const commun = {
  errandId: "00000000-0000-4000-8000-000000000001",
  budgetEstimate: 25000,
  onDeclared: () => {},
};

describe("avance du client", () => {
  it("annonce le montant déclaré, et dit qu'il n'est pas encore reconnu", () => {
    render(
      <AdvancePanel
        {...commun}
        declaredAmount={25000}
        confirmedAmount={0}
        declaredAt="2026-08-19T10:00:00Z"
        confirmedAt={null}
      />
    );

    const texte = document.body.textContent ?? "";
    expect(texte).toContain(formatFcfa(25000));
    // Le défaut d'origine : le montant reconnu, à zéro, était présenté comme
    // la déclaration du client.
    expect(texte).not.toMatch(/déclaré un envoi de 0/i);
    expect(texte).toMatch(/en attente de confirmation par le shopper/i);
    expect(texte).toMatch(/n'est pas déduit de votre facture/i);
  });

  it("annonce le montant reconnu une fois le shopper passé", () => {
    render(
      <AdvancePanel
        {...commun}
        declaredAmount={25000}
        confirmedAmount={24000}
        declaredAt="2026-08-19T10:00:00Z"
        confirmedAt="2026-08-19T11:00:00Z"
      />
    );

    const texte = document.body.textContent ?? "";
    // C'est le montant reçu qui fait foi, pas celui annoncé.
    expect(texte).toContain(formatFcfa(24000));
    expect(texte).toMatch(/déduit de votre facture/i);
  });

  it("ouvre au shopper la confirmation de ce qu'il a reçu", () => {
    render(
      <AdvanceReceiptCard
        errandId={commun.errandId}
        declaredAmount={25000}
        declaredAt="2026-08-19T10:00:00Z"
        confirmedAmount={0}
        confirmedAt={null}
        onConfirmed={() => {}}
      />
    );

    expect(screen.getByRole("button", { name: /je confirme avoir reçu/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/montant reçu/i)).toBeInTheDocument();
  });

  it("ne propose rien à confirmer tant que le client n'a rien déclaré", () => {
    render(
      <AdvanceReceiptCard
        errandId={commun.errandId}
        declaredAmount={0}
        declaredAt={null}
        confirmedAmount={0}
        confirmedAt={null}
        onConfirmed={() => {}}
      />
    );

    // Un champ de saisie ici inviterait à reconnaître une somme jamais reçue.
    expect(screen.queryByRole("button", { name: /je confirme/i })).toBeNull();
    expect(document.body.textContent).toMatch(/n'a pas encore déclaré d'envoi/i);
  });
});
