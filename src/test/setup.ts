import "@testing-library/jest-dom";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

/**
 * Aucun test unitaire ne joint le réseau.
 *
 * Plusieurs écrans lisent le barème, la règle de commission ou les droits au
 * montage. Sans cette barrière, les monter dans un test ouvrait de vraies
 * requêtes vers la base de production : les tests lisaient des données réelles,
 * dépendaient de la latence du réseau, et deux d'entre eux dépassaient le délai
 * imparti selon l'heure de la journée.
 *
 * La réponse est vide plutôt qu'une erreur : un écran doit savoir se rendre
 * quand la donnée n'est pas encore là, et c'est précisément cet état que le
 * test doit pouvoir observer. Un rejet le ferait tomber dans sa branche
 * d'erreur, qui n'est pas la même chose.
 *
 * Un test qui a besoin d'une réponse précise remplace ce comportement par un
 * `vi.spyOn(globalThis, "fetch")` local, dont la portée s'arrête à lui.
 */
const REPONSE_VIDE = () =>
  new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async () => REPONSE_VIDE()) as typeof globalThis.fetch;
