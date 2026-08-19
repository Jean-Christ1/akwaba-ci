import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  cancelDecision,
  canCancelErrand,
} from "@/pages/courses/ErrandDetailPage";
import { ErrandScheduleCard, decrireRythme } from "@/modules/errands/ui/ErrandScheduleCard";
import { TipCard } from "@/modules/errands/ui/TipCard";

/**
 * Le détail d'une course.
 *
 * Quatre défauts constatés sur cet écran : une annulation qui partait quand
 * l'utilisateur refusait de la motiver, un bouton d'annulation proposé là où
 * le serveur ne l'accepte plus, une programmation impossible à créer alors que
 * la base la propose, et un pourboire promis mais jamais saisissable.
 */

const COURSE_ID = "00000000-0000-4000-8000-000000000042";

describe("motif d'annulation", () => {
  it("renonce quand la fenêtre de saisie est fermée", () => {
    // window.prompt rend null sur fermeture ou sur Échap. Le code confondait ce
    // refus avec un motif vide et annulait la course quand même.
    expect(cancelDecision(null)).toEqual({ proceed: false });
  });

  it("annule avec un motif vide quand l'utilisateur valide sans rien écrire", () => {
    // Le motif reste facultatif : valider une saisie vide est un accord, pas un
    // refus. Les deux cas doivent donc se distinguer.
    expect(cancelDecision("")).toEqual({ proceed: true, reason: "" });
    expect(cancelDecision("Plus besoin")).toEqual({ proceed: true, reason: "Plus besoin" });
  });
});

describe("bouton d'annulation", () => {
  it("disparaît là où le serveur refuse déjà l'annulation", () => {
    // errand_cancel renvoie vers le litige sur une course livrée, et refuse une
    // course réglée. L'écran ne retirait que completed, cancelled et disputed.
    expect(canCancelErrand("delivered", "pending")).toBe(false);
    expect(canCancelErrand("shopping", "paid")).toBe(false);
    expect(canCancelErrand("completed", "pending")).toBe(false);
    expect(canCancelErrand("cancelled", "pending")).toBe(false);
    expect(canCancelErrand("disputed", "pending")).toBe(false);
  });

  it("reste offert tant que la course peut encore être annulée", () => {
    expect(canCancelErrand("open", "pending")).toBe(true);
    expect(canCancelErrand("assigned", "pending")).toBe(true);
    expect(canCancelErrand("delivering", "pending")).toBe(true);
  });
});

describe("programmation d'une course", () => {
  it("parle des rythmes comme la page des courses programmées", () => {
    // Les deux écrans décrivent le même enregistrement : une formulation
    // différente ferait douter le client d'avoir programmé ce qu'il croit.
    expect(decrireRythme("weekly", 6, 1, 9)).toBe("Chaque samedi, vers 09 h");
    expect(decrireRythme("biweekly", 6, 1, 9)).toBe("Un samedi sur deux, vers 09 h");
    expect(decrireRythme("monthly", 6, 3, 18)).toBe("Le 3 de chaque mois, vers 18 h");
  });

  it("ouvre au client le contrôle qui manquait, avec le titre de sa course", () => {
    render(<ErrandScheduleCard errandId={COURSE_ID} errandTitle="Marché du samedi" />);

    fireEvent.click(screen.getByRole("button", { name: /programmer cette course/i }));

    expect(screen.getByLabelText(/nom de la programmation/i)).toHaveValue("Marché du samedi");
    expect(screen.getByLabelText(/rythme/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^programmer$/i })).toBeEnabled();
  });

  it("refuse d'envoyer un nom que la base rejetterait", () => {
    render(<ErrandScheduleCard errandId={COURSE_ID} errandTitle="Marché du samedi" />);
    fireEvent.click(screen.getByRole("button", { name: /programmer cette course/i }));

    // La table exige un libellé d'au moins deux caractères une fois découpé.
    fireEvent.change(screen.getByLabelText(/nom de la programmation/i), {
      target: { value: " a " },
    });

    expect(screen.getByRole("button", { name: /^programmer$/i })).toBeDisabled();
  });

  it("ne propose jamais un jour du mois que la base refuse", () => {
    render(<ErrandScheduleCard errandId={COURSE_ID} errandTitle="Pharmacie du mois" />);
    fireEvent.click(screen.getByRole("button", { name: /programmer cette course/i }));

    fireEvent.change(screen.getByLabelText(/rythme/i), { target: { value: "monthly" } });

    const jours = screen.getByLabelText(/jour du mois/i);
    const valeurs = Array.from(jours.querySelectorAll("option")).map((o) => o.value);
    expect(valeurs).toContain("28");
    // Au-delà du 28, la contrainte de la table refuse : proposer le 31 ferait
    // sauter les mois courts sans explication.
    expect(valeurs).not.toContain("29");
    expect(valeurs).not.toContain("31");
  });
});

describe("pourboire", () => {
  it("offre au client le champ qui n'existait nulle part", () => {
    render(
      <TipCard
        errandId={COURSE_ID}
        currentTip={0}
        paymentStatus="pending"
        onAdded={() => {}}
      />
    );

    expect(screen.getByLabelText(/montant du pourboire/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /laisser un pourboire/i })).toBeInTheDocument();
    // Le pourboire n'est pas commissionné : le client doit savoir où va son geste.
    expect(document.body.textContent ?? "").toMatch(/revient en entier au shopper/i);
  });

  it("dit que le montant remplace le précédent, et ne s'ajoute pas", () => {
    render(
      <TipCard
        errandId={COURSE_ID}
        currentTip={2000}
        paymentStatus="pending"
        onAdded={() => {}}
      />
    );

    const texte = document.body.textContent ?? "";
    expect(texte).toMatch(/2\s*000 FCFA/);
    expect(texte).toMatch(/remplace/i);
  });

  it("se retire une fois la course réglée, puisque le serveur le refuse", () => {
    const { container } = render(
      <TipCard
        errandId={COURSE_ID}
        currentTip={2000}
        paymentStatus="paid"
        onAdded={() => {}}
      />
    );

    // errand_add_tip lève une exception après paiement : proposer le champ
    // promettrait un geste que le serveur ne peut plus accepter.
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByLabelText(/montant du pourboire/i)).not.toBeInTheDocument();
  });
});
