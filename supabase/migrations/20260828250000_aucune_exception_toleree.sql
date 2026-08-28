-- Une fonction de déclencheur n'a pas besoin d'être exécutable directement :
-- appelée hors d'un déclencheur, PostgreSQL la refuse de toute façon. Le droit
-- par défaut de PUBLIC est retiré parce que l'audit le signale, et qu'une
-- exception tolérée est une exception qu'on cesse de voir.
REVOKE ALL ON FUNCTION public.guard_annulation_paiement_en_cours() FROM PUBLIC;
