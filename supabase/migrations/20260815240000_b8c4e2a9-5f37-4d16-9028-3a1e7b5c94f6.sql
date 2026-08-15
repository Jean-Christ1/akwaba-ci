-- ---------------------------------------------------------------------------
-- Un COALESCE promouvait le type et rendait la fonction introuvable.
--
-- COALESCE(p_hour, 9) rend un integer, alors que schedule_next_run attend un
-- smallint : PostgreSQL ne trouvait alors aucune signature correspondante et
-- refusait la creation d'une programmation avec « No function matches ».
--
-- Le defaut ne se voit pas a la lecture, il n'apparait qu'a l'execution, ce
-- qu'un essai reel a immediatement montre. Le transtypage est desormais
-- explicite, la ou la promotion avait lieu.
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
  v_hour     smallint;
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
  v_hour := COALESCE(p_hour, 9)::smallint;

  INSERT INTO public.errand_schedules (
    customer_id, template_id, label, rhythm, day_of_week, day_of_month, hour_of_day, next_run_at
  ) VALUES (
    auth.uid(), p_errand_id, left(trim(p_label), 80), v_rhythm,
    p_day_of_week, p_day_of_month, v_hour,
    public.schedule_next_run(v_rhythm, p_day_of_week, p_day_of_month, v_hour)
  )
  RETURNING * INTO v_schedule;

  RETURN v_schedule;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_schedule_create(uuid, text, text, smallint, smallint, smallint)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_schedule_create(uuid, text, text, smallint, smallint, smallint)
  TO authenticated;
