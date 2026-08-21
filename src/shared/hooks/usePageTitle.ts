import { useEffect } from "react";

const SUFFIXE = "Akwaba";

/**
 * Titre de la page courante.
 *
 * Dans une application à page unique, le titre reste figé d'un écran à l'autre
 * si personne ne le met à jour. Cela dégrade trois choses à la fois : le
 * repérage entre onglets, l'annonce faite aux lecteurs d'écran lors d'une
 * navigation, et l'intitulé enregistré dans l'historique du navigateur.
 */
export function usePageTitle(titre: string, description?: string) {
  useEffect(() => {
    document.title = titre ? `${titre} · ${SUFFIXE}` : SUFFIXE;

    if (description) {
      let balise = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (!balise) {
        balise = document.createElement("meta");
        balise.name = "description";
        document.head.appendChild(balise);
      }
      balise.content = description;
    }
  }, [titre, description]);
}

export default usePageTitle;
