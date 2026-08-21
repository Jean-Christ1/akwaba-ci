-- ---------------------------------------------------------------------------
-- Moindre privilège pour le rôle anonyme.
--
-- Supabase accorde par défaut tous les privilèges à anon, authenticated et
-- service_role sur chaque table créée dans le schéma public. Le relevé fait sur
-- la base après migration montrait le résultat : anon, dont la clé est publique
-- et voyage dans le bundle du navigateur, détenait INSERT, UPDATE, DELETE et
-- TRUNCATE sur dix-neuf tables et vues, dont les courses, les rôles, les
-- portefeuilles, les écritures et les demandes de retrait.
--
-- Les politiques RLS bloquent aujourd'hui ces accès, ce qui a été vérifié en
-- conditions réelles. Mais elles sont alors la seule défense : une politique
-- oubliée sur une table future, une clause trop large, un RLS désactivé le
-- temps d'un correctif, et tout est ouvert à quiconque possède la clé publique.
-- Une défense unique n'est pas une défense.
--
-- On retire donc à anon tout ce dont le visiteur n'a pas besoin. Ce qu'un
-- visiteur consulte réellement sans compte reste accessible : le catalogue de
-- lieux, les villes et quartiers couverts, le barème affiché.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_objet record;
  -- Ce qu'un visiteur non connecté doit pouvoir lire, et rien de plus.
  v_lecture_publique text[] := ARRAY[
    'places',
    'service_cities',
    'service_zones',
    'commission_rules'
  ];
BEGIN
  FOR v_objet IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v_objet.relname);

    IF v_objet.relname = ANY (v_lecture_publique) THEN
      EXECUTE format('GRANT SELECT ON public.%I TO anon', v_objet.relname);
    END IF;
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Les vues respectent désormais les politiques de celui qui les interroge.
--
-- Une vue s'exécute par défaut avec les droits de son propriétaire, ce qui la
-- fait passer au travers de RLS. Les définitions actuelles filtrent bien par
-- elles-mêmes, ce qui a été vérifié : un tiers n'obtient aucune ligne. Mais ce
-- filtrage tient à la clause WHERE de chaque vue, pas au modèle d'autorisation,
-- et la première vue écrite sans cette précaution ouvrirait tout.
--
-- security_invoker aligne les vues sur le reste : elles voient ce que voit
-- l'appelant, jamais davantage.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_vue record;
BEGIN
  FOR v_vue IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = on)', v_vue.relname);
  END LOOP;
END
$$;

-- ---------------------------------------------------------------------------
-- Le privilège par défaut cesse d'ouvrir les tables à venir.
--
-- Sans cela, la prochaine table créée réarmerait exactement le problème que
-- cette migration corrige.
-- ---------------------------------------------------------------------------

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- Le marché ouvert reste lisible par les shoppers connectés : la vue filtre les
-- courses sans affectation et masque l'adresse exacte comme les notes du
-- client, ce qui est le seul niveau de détail dont un shopper a besoin pour
-- décider s'il propose son prix.
GRANT SELECT ON public.open_errands_feed TO authenticated;
GRANT SELECT ON public.errand_market_detail TO authenticated;
GRANT SELECT ON public.runner_public_profiles TO authenticated;
GRANT SELECT ON public.errand_payment_history TO authenticated;
GRANT SELECT ON public.errand_performance TO authenticated;
GRANT SELECT ON public.payment_methods_public TO authenticated;
GRANT SELECT ON public.payment_methods_public TO anon;
