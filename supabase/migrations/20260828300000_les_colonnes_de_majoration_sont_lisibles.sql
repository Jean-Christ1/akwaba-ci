-- Les deux colonnes de majoration étaient illisibles.
--
-- La table des courses est la seule dont la lecture est accordée colonne par
-- colonne, parce qu'elle porte le code de remise, qui doit rester invisible au
-- shopper. Ce choix a un prix, écrit dans le dépôt depuis qu'il s'est déjà payé
-- une fois : toute colonne ajoutée ensuite reste illisible tant qu'on ne
-- rafraîchit pas les privilèges, et un « select étoile » échoue en entier.
--
-- J'ai ajouté surge_fee et surge_reason sans appeler le rafraîchissement. Le
-- contrôle qui interdit précisément cette récidive l'a signalé, et il avait
-- raison : zéro des deux colonnes était accordée.
--
-- La migration qui ajoute les colonnes a été corrigée à la source, pour qu'un
-- déploiement neuf n'ait jamais le défaut. Celle-ci reste parce qu'elle a réparé
-- la base déjà en ligne : la retirer laisserait croire que le trou n'a jamais
-- existé, et le rafraîchissement est de toute façon idempotent.
--
-- La restriction d'écriture posée en même temps, elle, est reprise ici : le
-- rafraîchissement ne touche qu'à la lecture, mais l'ordre des deux opérations
-- mérite d'être écrit au même endroit pour qu'on ne les sépare pas.

SELECT public.refresh_errand_column_grants();

-- Le moteur seul écrit la majoration : la rouvrir à l'écriture directe
-- permettrait de gonfler la part exonérée de commission.
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'errands'
     AND column_name NOT IN ('surge_fee', 'surge_reason');
  EXECUTE 'REVOKE UPDATE ON public.errands FROM authenticated';
  EXECUTE 'GRANT UPDATE (' || v_cols || ') ON public.errands TO authenticated';
END;
$$;
