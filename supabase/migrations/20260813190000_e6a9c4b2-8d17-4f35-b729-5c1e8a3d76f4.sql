-- Suivi réel de la mission : temps écoulé, distance parcourue, dépassements
--
-- Jusqu'ici, seule l'estimation existait. Une course pouvait durer trois heures
-- au lieu d'une, parcourir vingt kilomètres au lieu de six, sans que rien n'en
-- garde trace. Trois conséquences : le shopper travaillait gratuitement au delà
-- de l'estimation, le client ne pouvait pas vérifier ce qu'il payait, et aucun
-- litige sur un dépassement n'était arbitrable faute de preuve.
--
-- Ce suivi enregistre ce qui s'est réellement passé, à côté de ce qui avait été
-- estimé, et calcule un supplément encadré lorsque l'écart dépasse une
-- tolérance. Le supplément est plafonné : un client ne doit jamais découvrir une
-- facture sans rapport avec ce qu'il a accepté.

-- ---------------------------------------------------------------------------
-- 1. Colonnes de réalisation
-- ---------------------------------------------------------------------------

ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS actual_distance_km numeric(12,2),
  ADD COLUMN IF NOT EXISTS overtime_minutes   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_distance_km  numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overrun_fee        numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overrun_approved_at timestamptz;

COMMENT ON COLUMN public.errands.actual_distance_km IS
  'Distance réellement parcourue, relevée par les points de suivi du shopper.';
COMMENT ON COLUMN public.errands.overtime_minutes IS
  'Minutes au delà de la durée estimée, tolérance déduite.';
COMMENT ON COLUMN public.errands.overrun_fee IS
  'Supplément facturé au titre du dépassement, plafonné par le barème.';

-- Barème du dépassement, versionné comme la commission.
ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS overtime_grace_minutes integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS overtime_per_minute    numeric(12,2) NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS distance_grace_km      numeric(12,2) NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS distance_per_km        numeric(12,2) NOT NULL DEFAULT 130,
  ADD COLUMN IF NOT EXISTS overrun_cap_ratio      numeric(5,2)  NOT NULL DEFAULT 0.50;

COMMENT ON COLUMN public.commission_rules.overrun_cap_ratio IS
  'Plafond du supplément, exprimé en part du frais de service initial.';

-- ---------------------------------------------------------------------------
-- 2. Points de suivi de la mission
--
-- Le shopper transmet sa position pendant la course. Ces points servent à trois
-- choses : calculer la distance réellement parcourue, rassurer le client sur
-- l'avancement, et constituer une preuve en cas de litige.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.errand_tracking (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id   uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  runner_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat         numeric(9,6) NOT NULL,
  lng         numeric(9,6) NOT NULL,
  accuracy_m  numeric(8,2),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.errand_tracking ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_errand_tracking_errand
  ON public.errand_tracking (errand_id, recorded_at);

-- Le shopper assigné dépose ses points ; les deux parties les consultent.
DROP POLICY IF EXISTS "Runner records tracking" ON public.errand_tracking;
CREATE POLICY "Runner records tracking"
  ON public.errand_tracking FOR INSERT TO authenticated
  WITH CHECK (
    runner_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.errands e
      WHERE e.id = errand_id
        AND e.runner_id = auth.uid()
        AND e.status IN ('assigned'::errand_status, 'shopping'::errand_status,
                         'delivering'::errand_status)
    )
  );

DROP POLICY IF EXISTS "Participants read tracking" ON public.errand_tracking;
CREATE POLICY "Participants read tracking"
  ON public.errand_tracking FOR SELECT TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

REVOKE ALL ON public.errand_tracking FROM anon;
GRANT SELECT, INSERT ON public.errand_tracking TO authenticated;
GRANT ALL ON public.errand_tracking TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Distance entre deux points
--
-- Formule de Haversine. Suffisante pour cumuler des segments urbains courts,
-- et sans dépendance à une extension spatiale.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.distance_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  r constant numeric := 6371;
  dlat numeric;
  dlng numeric;
  a    double precision;
BEGIN
  IF lat1 IS NULL OR lng1 IS NULL OR lat2 IS NULL OR lng2 IS NULL THEN
    RETURN 0;
  END IF;

  dlat := radians(lat2 - lat1);
  dlng := radians(lng2 - lng1);

  a := sin(dlat / 2) ^ 2
       + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlng / 2) ^ 2;

  RETURN round((r * 2 * asin(least(1, sqrt(a))))::numeric, 3);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Dépôt d'un point de suivi
--
-- Renvoie la distance cumulée, ce qui permet au shopper de voir son compteur
-- avancer sans requête supplémentaire.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_track_position(
  p_errand_id uuid,
  p_lat       numeric,
  p_lng       numeric,
  p_accuracy  numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand   public.errands;
  v_dernier  public.errand_tracking;
  v_ajout    numeric(12,3);
  v_total    numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné transmet sa position.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status NOT IN ('assigned'::errand_status, 'shopping'::errand_status,
                             'delivering'::errand_status) THEN
    RAISE EXCEPTION 'Le suivi ne s''applique qu''à une course en cours.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_dernier FROM public.errand_tracking
  WHERE errand_id = p_errand_id
  ORDER BY recorded_at DESC
  LIMIT 1;

  INSERT INTO public.errand_tracking (errand_id, runner_id, lat, lng, accuracy_m)
  VALUES (p_errand_id, auth.uid(), p_lat, p_lng, p_accuracy);

  -- Un déplacement inférieur à trente mètres relève du bruit de mesure et ne
  -- doit pas gonfler artificiellement la distance facturée.
  v_ajout := 0;
  IF FOUND OR v_dernier.id IS NOT NULL THEN
    v_ajout := public.distance_km(v_dernier.lat, v_dernier.lng, p_lat, p_lng);
    IF v_ajout < 0.03 THEN
      v_ajout := 0;
    END IF;
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands
  SET actual_distance_km = COALESCE(actual_distance_km, 0) + v_ajout
  WHERE id = p_errand_id
  RETURNING actual_distance_km INTO v_total;

  RETURN COALESCE(v_total, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.errand_track_position(uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_track_position(uuid, numeric, numeric, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Calcul du dépassement
--
-- Appelé au moment de la facture. Compare le réalisé à l'estimé, applique une
-- tolérance, puis plafonne le supplément.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_compute_overrun(p_errand_id uuid)
RETURNS TABLE (
  overtime_minutes  integer,
  extra_distance_km numeric,
  overrun_fee       numeric,
  capped            boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand   public.errands;
  v_rule     public.commission_rules;
  v_ecoulees integer;
  v_sup_min  integer;
  v_sup_km   numeric(12,2);
  v_brut     numeric(12,2);
  v_plafond  numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_rule := public.current_commission_rule();

  -- Tant que la course n'est pas terminée, le temps continue de courir.
  v_ecoulees := GREATEST(
    EXTRACT(EPOCH FROM (COALESCE(
      CASE WHEN v_errand.status IN ('completed'::errand_status, 'cancelled'::errand_status)
           THEN v_errand.updated_at ELSE now() END,
      now()
    ) - COALESCE(v_errand.started_at, v_errand.created_at)))::integer / 60,
    0
  );

  v_sup_min := GREATEST(
    v_ecoulees - COALESCE(v_errand.estimated_minutes, 0) - v_rule.overtime_grace_minutes,
    0
  );

  v_sup_km := GREATEST(
    COALESCE(v_errand.actual_distance_km, 0)
      - COALESCE(v_errand.distance_km, 0)
      - v_rule.distance_grace_km,
    0
  );

  v_brut := round(v_sup_min * v_rule.overtime_per_minute + v_sup_km * v_rule.distance_per_km, 2);
  v_plafond := round(COALESCE(v_errand.service_fee, 0) * v_rule.overrun_cap_ratio, 2);

  overtime_minutes := v_sup_min;
  extra_distance_km := v_sup_km;
  overrun_fee := LEAST(v_brut, v_plafond);
  capped := v_brut > v_plafond;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_compute_overrun(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_compute_overrun(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. La facture intègre le dépassement constaté
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_save_invoice(
  p_errand_id   uuid,
  p_items_total numeric,
  p_delivery_fee numeric DEFAULT 0,
  p_tip_amount  numeric DEFAULT 0,
  p_receipt_url text    DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_commission numeric(12,2);
  v_total      numeric(12,2);
  v_depass     record;
  v_service    numeric(12,2);
BEGIN
  IF p_items_total < 0 OR p_delivery_fee < 0 OR p_tip_amount < 0 THEN
    RAISE EXCEPTION 'Les montants d''une facture ne peuvent pas être négatifs.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné peut enregistrer la facture.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status NOT IN ('shopping'::errand_status, 'delivering'::errand_status, 'delivered'::errand_status) THEN
    RAISE EXCEPTION 'La facture ne peut être enregistrée qu''une fois les courses commencées.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée, sa facture ne peut plus être modifiée.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.current_commission_rule();

  -- Dépassement constaté : il s'ajoute au frais de service, et la commission
  -- porte sur l'ensemble, puisque le travail supplémentaire est réel.
  SELECT * INTO v_depass FROM public.errand_compute_overrun(p_errand_id);

  v_service := COALESCE(v_errand.service_fee, 0) + COALESCE(v_depass.overrun_fee, 0);
  v_commission := round(v_service * v_rule.rate, 2);
  v_total := p_items_total + v_service + p_delivery_fee + p_tip_amount;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    items_total       = p_items_total,
    delivery_fee      = p_delivery_fee,
    tip_amount        = p_tip_amount,
    overtime_minutes  = COALESCE(v_depass.overtime_minutes, 0),
    extra_distance_km = COALESCE(v_depass.extra_distance_km, 0),
    overrun_fee       = COALESCE(v_depass.overrun_fee, 0),
    commission_rate   = v_rule.rate,
    commission_amount = v_commission,
    runner_payout     = v_service - v_commission + p_tip_amount,
    total_amount      = v_total,
    balance_due       = GREATEST(v_total - COALESCE(v_errand.advance_amount, 0), 0),
    receipt_url       = COALESCE(p_receipt_url, receipt_url),
    actual_minutes    = GREATEST(
      EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at)))::integer / 60, 0
    )
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(
    p_errand_id,
    v_errand.status,
    CASE
      WHEN COALESCE(v_depass.overrun_fee, 0) > 0
        THEN 'Facture enregistrée, dépassement de ' || v_depass.overtime_minutes || ' min et '
             || v_depass.extra_distance_km || ' km'
      ELSE 'Facture enregistrée'
    END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Vue de pilotage : estimé contre réalisé
--
-- C'est cette vue que la console d'exploitation consulte pour juger de la
-- qualité des estimations et repérer les dérives.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.errand_performance AS
  SELECT
    e.id,
    e.title,
    e.city,
    e.zone,
    e.status,
    e.customer_id,
    e.runner_id,
    e.created_at,
    e.started_at,
    e.estimated_minutes,
    e.actual_minutes,
    e.overtime_minutes,
    e.distance_km        AS estimated_distance_km,
    e.actual_distance_km,
    e.extra_distance_km,
    e.service_fee,
    e.overrun_fee,
    e.commission_amount,
    e.runner_payout,
    e.total_amount,
    -- Écarts relatifs, pour repérer d'un coup d'oeil une estimation qui dérape.
    CASE WHEN COALESCE(e.estimated_minutes, 0) > 0
         THEN round((COALESCE(e.actual_minutes, 0)::numeric / e.estimated_minutes - 1) * 100, 1)
    END AS time_variance_pct,
    CASE WHEN COALESCE(e.distance_km, 0) > 0
         THEN round((COALESCE(e.actual_distance_km, 0) / e.distance_km - 1) * 100, 1)
    END AS distance_variance_pct
  FROM public.errands e
  WHERE public.is_errand_participant(e.id, auth.uid())
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role);

COMMENT ON VIEW public.errand_performance IS
  'Estimé contre réalisé, temps et distance, pour le pilotage et pour les parties de la course.';

GRANT SELECT ON public.errand_performance TO authenticated;
