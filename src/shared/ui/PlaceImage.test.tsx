import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PlaceImage } from "./PlaceImage";

describe("PlaceImage", () => {
  it("affiche la photographie quand elle est disponible", () => {
    render(<PlaceImage src="/places/place-maquis.jpg" alt="Allocodrome de Zone 4" />);
    const image = screen.getByAltText("Allocodrome de Zone 4");
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute("src", "/places/place-maquis.jpg");
  });

  it("bascule sur un repli lisible quand l'image est introuvable", () => {
    render(<PlaceImage src="/places/inexistante.jpg" alt="Lieu sans photo" />);

    // Le navigateur signalerait l'échec de chargement par cet événement.
    fireEvent.error(screen.getByAltText("Lieu sans photo"));

    expect(screen.queryByAltText("Lieu sans photo")).not.toBeInTheDocument();
    // Le repli reste annoncé aux lecteurs d'écran, avec le nom du lieu.
    expect(screen.getByRole("img", { name: "Lieu sans photo" })).toBeInTheDocument();
  });

  it("affiche directement le repli lorsqu'aucune image n'est renseignée", () => {
    render(<PlaceImage src={null} alt="Fiche sans photographie" />);
    expect(screen.getByRole("img", { name: "Fiche sans photographie" })).toBeInTheDocument();
  });

  it("diffère le chargement sauf pour l'image mise en avant", () => {
    const { rerender } = render(<PlaceImage src="/a.jpg" alt="Différée" />);
    expect(screen.getByAltText("Différée")).toHaveAttribute("loading", "lazy");

    rerender(<PlaceImage src="/a.jpg" alt="Différée" priority />);
    expect(screen.getByAltText("Différée")).toHaveAttribute("loading", "eager");
  });

  it("réserve ses dimensions pour éviter un décalage de mise en page", () => {
    render(<PlaceImage src="/a.jpg" alt="Dimensionnée" />);
    const image = screen.getByAltText("Dimensionnée");
    expect(image).toHaveAttribute("width");
    expect(image).toHaveAttribute("height");
  });
});
