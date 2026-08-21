import { describe, expect, it } from "vitest";

import { safeRedirect } from "./safeRedirect";

describe("safeRedirect", () => {
  it("accepte un chemin interne", () => {
    expect(safeRedirect("/courses/nouvelle")).toBe("/courses/nouvelle");
    expect(safeRedirect("/lieu/lodge-cocody-lagune")).toBe("/lieu/lodge-cocody-lagune");
  });

  it("retombe sur la destination par défaut quand rien n'est demandé", () => {
    expect(safeRedirect(null)).toBe("/profil");
    expect(safeRedirect("")).toBe("/profil");
  });

  it("refuse une adresse absolue vers un autre site", () => {
    expect(safeRedirect("https://exemple-malveillant.test/piege")).toBe("/profil");
    expect(safeRedirect("http://exemple-malveillant.test")).toBe("/profil");
  });

  it("refuse la double barre oblique, interprétée comme une adresse absolue", () => {
    expect(safeRedirect("//exemple-malveillant.test/piege")).toBe("/profil");
  });

  it("refuse une barre oblique inversée, normalisée par certains navigateurs", () => {
    expect(safeRedirect("/\\exemple-malveillant.test")).toBe("/profil");
    expect(safeRedirect("\\exemple-malveillant.test")).toBe("/profil");
  });

  it("refuse un schéma glissé dans le chemin", () => {
    expect(safeRedirect("/javascript:alert(1)")).toBe("/profil");
    expect(safeRedirect("/data:text/html,<script>")).toBe("/profil");
  });

  it("permet de choisir une autre destination par défaut", () => {
    expect(safeRedirect(null, "/")).toBe("/");
  });
});
