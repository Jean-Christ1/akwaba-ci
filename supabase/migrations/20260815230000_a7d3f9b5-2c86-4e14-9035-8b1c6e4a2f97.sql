-- ---------------------------------------------------------------------------
-- Refaire une course, et la programmer.
--
-- Les courses du quotidien se répètent : le marché du samedi, la pharmacie du
-- mois, les provisions envoyées à un parent. Chaque fois, le client
-- reconstituait la même demande article par article, ce qui suffit à décourager
-- la deuxième commande alors que c'est elle qui fait un client fidèle.
--
-- Deux besoins distincts, traités séparément parce qu'ils ne se ressemblent
-- pas. Refaire une course est un geste, immédiat, déclenché par le client
-- quand il le décide. La programmer est un engagement, qui court sans lui et
-- doit donc pouvoir être suspendu, corrigé et arrêté.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Refaire une course.
--
-- On recopie ce que le client avait décrit, jamais ce que la plateforme avait
-- calculé : ni prix, ni commission, ni shopper, ni code de remise. Une course
-- refaite est une demande neuve, tarifée au barème du jour.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_duplicate(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source public.errands;
  v_neuve  public.errands;
BEGIN
  SELECT * INTO v_source FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_source.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez refaire que vos propres courses.' USING ERRCODE = '42501';
  END IF;

  -- La description est reprise, le calcul ne l'est pas : errand_create refait
  -- le devis au barème en vigueur, qui a pu changer depuis.
  v_neuve := public.errand_create(
    v_source.title,
    v_source.category,
    v_source.city,
    v_source.zone,
    v_source.delivery_address,
    v_source.items,
    v_source.budget_estimate,
    v_source.notes,
    v_source.preferred_contact,
    NULL,                      -- la date voulue se redécide à chaque fois
    v_source.payment_method,
    v_source.vehicle_required,
    v_source.volume_size,
    v_source.urgency,
    v_source.distance_km,
    v_source.estimated_minutes,
    v_source.dropoff_mode,
    v_source.third_party_contact,
    v_source.fund_mode,
    v_source.lat,
    v_source.lng
  );

  -- La consigne de remplacement fait partie de la demande, pas du calcul.
  PERFORM set_config('app.errand_engine', 'on', true);
  UPDATE public.errands SET
    substitution_policy = v_source.substitution_policy,
    substitution_price_tolerance_pct = v_source.substitution_price_tolerance_pct
  WHERE id = v_neuve.id
  RETURNING * INTO v_neuve;
  PERFORM set_config('app.errand_engine', 'off', true);

  RETURN v_neuve;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_duplicate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_duplicate(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Programmer une course.
--
-- Le modèle porte la demande, la planification porte le rythme. Les séparer
-- permet de suspendre une programmation sans perdre la demande, et de corriger
-- la demande sans réécrire le rythme.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'schedule_rhythm') THEN
    CREATE TYPE public.schedule_rhythm AS ENUM ('weekly', 'biweekly', 'monthly');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.errand_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- La course qui sert de modèle. Sa suppression n'arrête pas la
  -- programmation : le modèle est recopié à la création, pas relu à chaque fois.
  template_id   uuid REFERENCES public.errands(id) ON DELETE SET NULL,
  label         text NOT NULL,
  rhythm        schedule_rhythm NOT NULL,
  -- Jour retenu : 0 à 6 pour un rythme hebdomadaire, 1 à 28 pour un rythme
  -- mensuel. Vingt-huit et pas trente et un : un rendez-vous du 31 sauterait
  -- les mois courts sans que personne ne comprenne pourquoi.
  day_of_week   smallint CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month  smallint CHECK (day_of_month BETWEEN 1 AND 28),
  hour_of_day   smallint NOT NULL DEFAULT 9 CHECK (hour_of_day BETWEEN 0 AND 23),
  is_active     boolean NOT NULL DEFAULT true,
  next_run_at   timestamptz NOT NULL,
  last_run_at   timestamptz,
  runs_count    integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT errand_schedules_label_len CHECK (char_length(trim(label)) BETWEEN 2 AND 80),
  -- Un rythme hebdomadaire sans jour de semaine, ou mensuel sans jour du mois,
  -- ne saurait pas quand se déclencher.
  CONSTRAINT errand_schedules_day_required CHECK (
    (rhythm IN ('weekly', 'biweekly') AND day_of_week IS NOT NULL)
    OR (rhythm = 'monthly' AND day_of_month IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS errand_schedules_due
  ON public.errand_schedules (next_run_at) WHERE is_active;

CREATE INDEX IF NOT EXISTS errand_schedules_owner
  ON public.errand_schedules (customer_id, is_active);

ALTER TABLE public.errand_schedules ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.errand_schedules FROM anon, authenticated;
GRANT SELECT ON public.errand_schedules TO authenticated;

DROP POLICY IF EXISTS "Own schedules" ON public.errand_schedules;
CREATE POLICY "Own schedules"
  ON public.errand_schedules FOR SELECT
  TO authenticated
  USING (
    customer_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- ---------------------------------------------------------------------------
-- Quand tombe la prochaine occurrence.
--
-- Isolée pour être vérifiable seule : c'est le calcul le plus facile à se
-- tromper, et le plus difficile à constater après coup.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.schedule_next_run(
  p_rhythm       schedule_rhythm,
  p_day_of_week  smallint,
  p_day_of_month smallint,
  p_hour         smallint,
  p_depuis       timestamptz DEFAULT now()
)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_base date := (p_depuis AT TIME ZONE 'UTC')::date;
  v_cible timestamptz;
  v_ecart integer;
BEGIN
  IF p_rhythm = 'monthly' THEN
    v_cible := make_timestamptz(
      EXTRACT(YEAR FROM v_base)::int, EXTRACT(MONTH FROM v_base)::int,
      p_day_of_month, p_hour, 0, 0, 'UTC');

    -- La date de ce mois est passée : on vise le mois suivant.
    IF v_cible <= p_depuis THEN
      v_cible := v_cible + interval '1 month';
    END IF;
    RETURN v_cible;
  END IF;

  -- Rythme hebdomadaire : nombre de jours jusqu'au prochain jour voulu.
  v_ecart := (p_day_of_week - EXTRACT(DOW FROM v_base)::int + 7) % 7;
  v_cible := make_timestamptz(
    EXTRACT(YEAR FROM v_base)::int, EXTRACT(MONTH FROM v_base)::int,
    EXTRACT(DAY FROM v_base)::int, p_hour, 0, 0, 'UTC') + make_interval(days => v_ecart);

  IF v_cible <= p_depuis THEN
    v_cible := v_cible + interval '7 days';
  END IF;

  IF p_rhythm = 'biweekly' THEN
    v_cible := v_cible + interval '7 days';
  END IF;

  RETURN v_cible;
END;
$$;

-- ---------------------------------------------------------------------------
-- Créer, suspendre et arrêter une programmation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_schedule_create(
  p_errand_id    uuid,
  p_label        text,
  p_rhythm       text,
  p_day_of_week  smallint DEFAULT NULL,
  p_day_of_month smallint DEFAULT NULL,
  p_hour         smallint DEFAULT 9
)
RETURNS public.errand_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand   public.errands;
  v_schedule public.errand_schedules;
  v_rhythm   schedule_rhythm;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Vous ne pouvez programmer que vos propres courses.' USING ERRCODE = '42501';
  END IF;

  IF p_rhythm NOT IN ('weekly', 'biweekly', 'monthly') THEN
    RAISE EXCEPTION 'Rythme inconnu.' USING ERRCODE = '22023';
  END IF;
  v_rhythm := p_rhythm::schedule_rhythm;

  INSERT INTO public.errand_schedules (
    customer_id, template_id, label, rhythm, day_of_week, day_of_month, hour_of_day, next_run_at
  ) VALUES (
    auth.uid(), p_errand_id, left(trim(p_label), 80), v_rhythm,
    p_day_of_week, p_day_of_month, COALESCE(p_hour, 9),
    public.schedule_next_run(v_rhythm, p_day_of_week, p_day_of_month, COALESCE(p_hour, 9))
  )
  RETURNING * INTO v_schedule;

  RETURN v_schedule;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_schedule_create(uuid, text, text, smallint, smallint, smallint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_schedule_create(uuid, text, text, smallint, smallint, smallint)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.errand_schedule_set_active(
  p_schedule_id uuid,
  p_active      boolean
)
RETURNS public.errand_schedules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule public.errand_schedules;
BEGIN
  SELECT * INTO v_schedule FROM public.errand_schedules WHERE id = p_schedule_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Programmation introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_schedule.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cette programmation ne vous appartient pas.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.errand_schedules SET
    is_active = p_active,
    -- Reprendre une programmation suspendue ne doit pas déclencher aussitôt
    -- toutes les occurrences manquées : on repart de maintenant.
    next_run_at = CASE
      WHEN p_active AND NOT v_schedule.is_active
        THEN public.schedule_next_run(v_schedule.rhythm, v_schedule.day_of_week,
                                      v_schedule.day_of_month, v_schedule.hour_of_day)
      ELSE next_run_at END,
    updated_at = now()
  WHERE id = p_schedule_id
  RETURNING * INTO v_schedule;

  RETURN v_schedule;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_schedule_set_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_schedule_set_active(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ce que l'ordonnanceur exécute.
--
-- Réservé au service : une programmation qui pourrait être déclenchée depuis le
-- navigateur permettrait de créer autant de courses que voulu.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_schedules_run_due(p_limit integer DEFAULT 50)
RETURNS TABLE (schedule_id uuid, errand_id uuid, erreur text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_s      public.errand_schedules;
  v_source public.errands;
  v_neuve  public.errands;
BEGIN
  FOR v_s IN
    SELECT * FROM public.errand_schedules
    WHERE is_active AND next_run_at <= now()
    ORDER BY next_run_at
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      SELECT * INTO v_source FROM public.errands WHERE id = v_s.template_id;

      IF NOT FOUND THEN
        -- Le modèle a disparu : la programmation n'a plus d'objet. On
        -- l'arrête plutôt que de la laisser échouer indéfiniment.
        UPDATE public.errand_schedules
        SET is_active = false, updated_at = now()
        WHERE id = v_s.id;

        schedule_id := v_s.id; errand_id := NULL;
        erreur := 'modèle supprimé, programmation arrêtée';
        RETURN NEXT;
        CONTINUE;
      END IF;

      PERFORM set_config('request.jwt.claims',
        json_build_object('sub', v_s.customer_id, 'role', 'authenticated')::text, true);

      v_neuve := public.errand_duplicate(v_s.template_id);

      UPDATE public.errand_schedules SET
        last_run_at = now(),
        runs_count  = runs_count + 1,
        next_run_at = public.schedule_next_run(rhythm, day_of_week, day_of_month, hour_of_day),
        updated_at  = now()
      WHERE id = v_s.id;

      schedule_id := v_s.id; errand_id := v_neuve.id; erreur := NULL;
      RETURN NEXT;

    EXCEPTION WHEN OTHERS THEN
      -- Une programmation qui échoue ne doit pas empêcher les suivantes de
      -- s'exécuter, ni se rejouer en boucle à chaque passage.
      UPDATE public.errand_schedules SET
        next_run_at = public.schedule_next_run(rhythm, day_of_week, day_of_month, hour_of_day),
        updated_at  = now()
      WHERE id = v_s.id;

      schedule_id := v_s.id; errand_id := NULL; erreur := left(SQLERRM, 200);
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_schedules_run_due(integer) FROM PUBLIC, anon, authenticated;
