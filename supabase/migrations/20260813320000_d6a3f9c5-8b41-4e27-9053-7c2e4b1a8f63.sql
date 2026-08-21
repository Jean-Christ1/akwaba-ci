-- ---------------------------------------------------------------------------
-- Une garde partagée entre deux tables citait une colonne d'une seule d'entre
-- elles.
--
-- guard_append_only_ledger protège errand_payments et errand_events. La
-- tolérance ajoutée pour l'effacement d'un compte lisait NEW.payer_id, colonne
-- qui n'existe que sur la première : toute écriture sur errand_events échouait
-- donc en 42703, et la suppression d'un compte restait impossible, cette fois
-- pour une autre raison que celle qu'on venait de corriger.
--
-- C'est la deuxième fois que ce piège se referme sur ce projet : PL/pgSQL ne
-- vérifie les champs de NEW qu'à l'exécution, si bien qu'une garde partagée
-- semble juste jusqu'au jour où elle s'exécute sur la mauvaise table. Une
-- fonction par table, et le problème ne peut plus se poser.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_append_only_payments()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Dénouer le lien vers une personne effacée n'est pas réécrire l'écriture :
    -- c'est ce qui permet à la trace comptable de survivre sans elle, comme le
    -- veulent à la fois la comptabilité et le droit à l'effacement.
    IF NEW.payer_id IS NULL AND OLD.payer_id IS NOT NULL
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.errand_id IS NOT DISTINCT FROM OLD.errand_id
       AND NEW.kind IS NOT DISTINCT FROM OLD.kind THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Une écriture financière ne se modifie pas. Corrigez-la par une nouvelle écriture.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.errands e WHERE e.id = OLD.errand_id) THEN
    RAISE EXCEPTION 'Une écriture financière ne se supprime pas tant que sa course existe.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_append_only_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'La chronologie d''une course ne se réécrit pas.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.errands e WHERE e.id = OLD.errand_id) THEN
    RAISE EXCEPTION 'La chronologie d''une course ne s''efface pas tant que la course existe.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_errand_payments_append_only ON public.errand_payments;
CREATE TRIGGER trg_errand_payments_append_only
  BEFORE UPDATE OR DELETE ON public.errand_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_payments();

DROP TRIGGER IF EXISTS trg_errand_events_append_only ON public.errand_events;
CREATE TRIGGER trg_errand_events_append_only
  BEFORE UPDATE OR DELETE ON public.errand_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_events();

DROP FUNCTION IF EXISTS public.guard_append_only_ledger();

-- ---------------------------------------------------------------------------
-- L'effacement d'un compte doit rester possible de bout en bout.
--
-- La chronologie d'une course cite son auteur. Comme pour les écritures
-- comptables, la trace survit à la personne : le lien est dénoué, l'événement
-- reste.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_col text;
BEGIN
  SELECT a.attname INTO v_col
  FROM pg_attribute a
  WHERE a.attrelid = 'public.errand_events'::regclass
    AND a.attname IN ('actor_id', 'author_id', 'created_by')
    AND a.attnum > 0 AND NOT a.attisdropped
  LIMIT 1;

  IF v_col IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.errand_events DROP CONSTRAINT IF EXISTS errand_events_%s_fkey', v_col);
    EXECUTE format(
      'ALTER TABLE public.errand_events ADD CONSTRAINT errand_events_%s_fkey
       FOREIGN KEY (%I) REFERENCES auth.users(id) ON DELETE SET NULL', v_col, v_col);
    EXECUTE format('ALTER TABLE public.errand_events ALTER COLUMN %I DROP NOT NULL', v_col);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Contrôle : aucune garde partagée ne doit citer une colonne absente de l'une
-- des tables sur lesquelles elle est posée.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_probleme text;
BEGIN
  SELECT string_agg(format('%s sur %s manque %s', p.proname, c.relname, m.col), ' ; ')
  INTO v_probleme
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_proc p ON p.oid = t.tgfoid
  JOIN pg_namespace n ON n.oid = p.pronamespace,
  LATERAL (
    SELECT DISTINCT mm[1] AS col
    FROM regexp_matches(p.prosrc, '(?:NEW|OLD)\.(\w+)', 'g') AS mm
  ) m
  WHERE NOT t.tgisinternal
    AND n.nspname = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_attribute a
      WHERE a.attrelid = c.oid AND a.attname = m.col
        AND a.attnum > 0 AND NOT a.attisdropped
    );

  IF v_probleme IS NOT NULL THEN
    RAISE EXCEPTION 'Des declencheurs citent des colonnes absentes : %', v_probleme;
  END IF;
END
$$;
