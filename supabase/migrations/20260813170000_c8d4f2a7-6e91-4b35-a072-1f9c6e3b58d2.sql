-- Chemins des images du catalogue
--
-- La migration de données de démarrage a été corrigée après avoir été poussée,
-- ce qui est une faute : une base ayant déjà appliqué la première version ne
-- rejouerait jamais la seconde, et garderait des chemins d'images morts.
--
-- Cette migration rattrape le cas indépendamment de l'ordre d'application. Elle
-- est sans effet si les chemins sont déjà bons.
--
-- Les images du catalogue sont servies depuis public/places : passer par
-- /assets casse les liens, puisque Vite ajoute une empreinte au nom de fichier
-- à chaque construction.

UPDATE public.places
SET image = replace(image, '/assets/', '/places/'),
    updated_at = now()
WHERE image LIKE '/assets/%';

-- Même correction dans les galeries, stockées en jsonb.
UPDATE public.places
SET gallery = (
      SELECT COALESCE(jsonb_agg(replace(valeur, '/assets/', '/places/')), '[]'::jsonb)
      FROM jsonb_array_elements_text(gallery) AS valeur
    ),
    updated_at = now()
WHERE gallery::text LIKE '%/assets/%';
