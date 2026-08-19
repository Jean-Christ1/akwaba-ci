-- ---------------------------------------------------------------------------
-- Les tirets cadratins des fiches publiées.
--
-- Les données de démarrage du catalogue ont été insérées avec des tirets
-- cadratins et demi-cadratins, y compris dans des textes lus par le visiteur :
-- une description de restaurant, des horaires d'ouverture, une heure conseillée.
-- La règle typographique du projet les interdit partout, et le fichier source
-- vient d'être corrigé. Les lignes déjà en base, elles, gardent l'ancien texte :
-- corriger la source ne réécrit rien de ce qui a été inséré.
--
-- La migration de démarrage n'est pas retouchée : une migration appliquée est
-- un fait passé, la réécrire donnerait une histoire qui ne correspond plus à ce
-- qui s'est produit. La correction porte donc sur les lignes.
--
-- Les caractères sont désignés par leur point de code, chr(8211) et chr(8212),
-- plutôt que collés dans le fichier : une règle qui interdit un caractère ne
-- doit pas obliger à l'écrire pour l'appliquer.
-- ---------------------------------------------------------------------------

-- Un tiret qui encadre une incise devient une virgule. Ce cas ne se distingue
-- pas automatiquement d'un intervalle d'heures, il est donc traité nommément.
UPDATE public.places
SET description = replace(replace(description, ' ' || chr(8212), ','), chr(8212) || ' ', '')
WHERE slug = 'le-comptoir-plateau'
  AND description ~ ('[' || chr(8211) || chr(8212) || ']');

-- Les horaires et l'heure conseillée : un intervalle se lit « de ... à ... ».
-- Le tiret devient « à » entouré d'espaces, puis les espaces surnuméraires sont
-- ramenés à un seul : « 9h-17h » collé donnerait sinon « 9hà17h », et
-- « 12:00 - 14:30 » garderait un espace double.
UPDATE public.places
SET hours = jsonb_set(
      hours,
      '{today}',
      to_jsonb(
        btrim(
          regexp_replace(
            regexp_replace(
              hours ->> 'today',
              '[' || chr(8211) || chr(8212) || ']',
              ' ' || chr(224) || ' ',
              'g'
            ),
            '[[:space:]]+', ' ', 'g'
          )
        )
      )
    )
WHERE hours ? 'today'
  AND (hours ->> 'today') ~ ('[' || chr(8211) || chr(8212) || ']');

UPDATE public.places
SET best_time = btrim(
      regexp_replace(
        regexp_replace(best_time, '[' || chr(8211) || chr(8212) || ']', ' ' || chr(224) || ' ', 'g'),
        '[[:space:]]+', ' ', 'g'
      )
    )
WHERE best_time IS NOT NULL
  AND best_time ~ ('[' || chr(8211) || chr(8212) || ']');

-- ---------------------------------------------------------------------------
-- Rien ne doit subsister : si un texte publié porte encore l'un des deux
-- caractères, la migration échoue plutôt que de laisser croire qu'elle a
-- nettoyé ce qu'elle n'a pas vu.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_motif    text := '[' || chr(8211) || chr(8212) || ']';
  v_restants text;
BEGIN
  SELECT string_agg(slug, ', ')
  INTO v_restants
  FROM public.places
  WHERE coalesce(name, '')              ~ v_motif
     OR coalesce(tagline, '')           ~ v_motif
     OR coalesce(description, '')       ~ v_motif
     OR coalesce(story, '')             ~ v_motif
     OR coalesce(best_time, '')         ~ v_motif
     OR coalesce(curator_note, '')      ~ v_motif
     OR coalesce(average_duration, '')  ~ v_motif
     OR coalesce((hours)::text, '')          ~ v_motif
     OR coalesce((why_visit)::text, '')      ~ v_motif
     OR coalesce((practical_tips)::text, '') ~ v_motif
     OR coalesce((services)::text, '')       ~ v_motif
     OR coalesce((tags)::text, '')           ~ v_motif
     OR coalesce((best_for)::text, '')       ~ v_motif;

  IF v_restants IS NOT NULL THEN
    RAISE EXCEPTION 'Tirets interdits encore présents sur : %', v_restants;
  END IF;
END
$$;
