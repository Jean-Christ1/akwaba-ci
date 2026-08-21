import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { formatFcfa } from "@/modules/errands/domain";
import { OfferComposer } from "@/modules/errands/ui/OfferComposer";

/**
 * Le plancher de prix d'une offre, éprouvé en manipulant l'écran.
 *
 * Une relecture adverse a montré que la garde d'origine ne gardait rien : en
 * retirant le refus d'envoi et la désactivation du bouton, aucun contrôle ne
 * rougissait, parce qu'ils ne faisaient que chercher des chaînes de caractères
 * dans le fichier source. Ces contrôles-ci tapent dans le champ et appuient sur
 * le bouton : supprimer la garde les fait échouer.
 *
 * Ce que la garde protège : le champ n'était contrôlé ni à la saisie ni à
 * l'envoi. Une offre partait à zéro, le client lisait « 0 FCFA », l'acceptait,
 * et le serveur retenait le plancher du barème. Le client payait des frais de
 * service pour une offre présentée comme gratuite.
 */

const PLANCHER = 1000;

/** Enveloppe contrôlée : le composeur reçoit son état du parent, comme en vrai. */
function Composeur({ onEnvoyer = () => {} }: { onEnvoyer?: () => void }) {
  const [prix, setPrix] = useState("");
  const [delai, setDelai] = useState("60");
  const [message, setMessage] = useState("");
  return (
    <OfferComposer
      ouvert
      onFermer={() => {}}
      prix={prix}
      setPrix={setPrix}
      delai={delai}
      setDelai={setDelai}
      message={message}
      setMessage={setMessage}
      plancher={PLANCHER}
      envoiEnCours={false}
      onEnvoyer={onEnvoyer}
    />
  );
}

const champPrix = () => screen.getByLabelText(/votre prix de service/i);
const bouton = () => screen.getByRole("button", { name: /envoyer/i });

describe("plancher de prix d'une offre", () => {
  it("refuse d'envoyer tant que rien n'est saisi", () => {
    const envoyer = vi.fn();
    render(<Composeur onEnvoyer={envoyer} />);

    expect(bouton()).toBeDisabled();
    fireEvent.click(bouton());
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("refuse un prix sous le plancher, et nomme le montant attendu", () => {
    const envoyer = vi.fn();
    render(<Composeur onEnvoyer={envoyer} />);

    fireEvent.change(champPrix(), { target: { value: "500" } });

    expect(bouton()).toBeDisabled();
    // Le message doit dire le montant, pas seulement « invalide ».
    expect(screen.getByRole("alert").textContent ?? "").toContain(formatFcfa(PLANCHER));
    fireEvent.click(bouton());
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("accepte dès que le prix atteint le plancher", () => {
    const envoyer = vi.fn();
    render(<Composeur onEnvoyer={envoyer} />);

    fireEvent.change(champPrix(), { target: { value: String(PLANCHER) } });

    expect(bouton()).toBeEnabled();
    fireEvent.click(bouton());
    expect(envoyer).toHaveBeenCalledTimes(1);
  });

  it("n'autorise rien tant que le barème n'est pas lu", () => {
    const envoyer = vi.fn();
    render(
      <OfferComposer
        ouvert
        onFermer={() => {}}
        prix="5000"
        setPrix={() => {}}
        delai="60"
        setDelai={() => {}}
        message=""
        setMessage={() => {}}
        plancher={PLANCHER}
        baremeEnCours
        envoiEnCours={false}
        onEnvoyer={envoyer}
      />
    );

    // Le repli du hook vaut 1 000 : sous un barème réel plus élevé, une offre
    // envoyée pendant cette fenêtre repasserait par le plancher du serveur.
    expect(bouton()).toBeDisabled();
    fireEvent.click(bouton());
    expect(envoyer).not.toHaveBeenCalled();
  });

  it("ne laisse pas saisir autre chose que des chiffres", () => {
    render(<Composeur />);

    fireEvent.change(champPrix(), { target: { value: "3 000 FCFA" } });

    expect(champPrix()).toHaveValue("3000");
  });
});
