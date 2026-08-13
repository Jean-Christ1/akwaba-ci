-- Jalons réels de la mission, et encadrement de l'écart de budget
--
-- Deux défauts de fond, relevés par une expertise du métier.
--
-- Premièrement, la durée de mission était comptée jusqu'à la confirmation du
-- client. Si le shopper livrait à onze heures et que le client confirmait le
-- lendemain matin, la course était enregistrée à plus de mille minutes. Tout
-- indicateur, toute prime de ponctualité et tout arbitrage bâti sur ce chiffre
-- était faux, et le shopper aurait eu raison de le contester.
--
-- Deuxièmement, la facture acceptait n'importe quel montant d'achats. Un
-- shopper pouvait déclarer 85 000 francs sur une course dont le budget annoncé
-- était 20 000, sans qu'aucun seuil ne s'y oppose et sans que le client ait
-- d'autre choix que d'accepter ou d'ouvrir un litige.

-- ---------------------------------------------------------------------------
-- 1. Jalons métier
-- ---------------------------------------------------------------------------

ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS accepted_at    timestamptz,
  ADD COLUMN IF NOT EXISTS shopping_at    timestamptz,
  ADD COLUMN IF NOT EXISTS delivering_at  timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at   timestamptz;

COMMENT ON COLUMN public.errands.shopping_at IS
  'Départ effectif du shopper. C''est de là que court la durée de mission.';
COMMENT ON COLUMN public.errands.delivered_at IS
  'Remise au client. La durée de mission s''arrête ici, pas à la confirmation.';

-- Tolérance d'écart sur le budget d'achat, versionnée avec le barème.
ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS budget_tolerance_pct numeric(5,2) NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS budget_tolerance_min numeric(12,2) NOT NULL DEFAULT 2000;

COMMENT ON COLUMN public.commission_rules.budget_tolerance_pct IS
  'Écart toléré sur le budget d''achat avant approbation explicite du client.';

-- Statut d'approbation de l'écart de budget.
ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS budget_overrun_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS budget_approved_at     timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Les transitions posent leur jalon
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_advance_status(
  p_errand_id     uuid,
  p_next          errand_status,
  p_handover_code text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_code   text;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné peut faire avancer cette course.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       (v_errand.status = 'assigned'::errand_status   AND p_next = 'shopping'::errand_status)
    OR (v_errand.status = 'shopping'::errand_status   AND p_next = 'delivering'::errand_status)
    OR (v_errand.status = 'delivering'::errand_status AND p_next = 'delivered'::errand_status)
  ) THEN
    RAISE EXCEPTION 'Cette progression de statut n''est pas autorisée.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'delivered'::errand_status THEN
    v_code := regexp_replace(COALESCE(p_handover_code, ''), '\s', '', 'g');

    IF v_errand.handover_code IS NOT NULL AND v_errand.handover_code <> v_code THEN
      RAISE EXCEPTION 'Code de remise incorrect. Demandez au client le code affiché sur sa course.'
        USING ERRCODE = '22023';
    END IF;

    IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
      RAISE EXCEPTION 'Déposez le reçu des achats avant de marquer la course comme livrée.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    status        = p_next,
    shopping_at   = CASE WHEN p_next = 'shopping'::errand_status   THEN now() ELSE shopping_at   END,
    delivering_at = CASE WHEN p_next = 'delivering'::errand_status THEN now() ELSE delivering_at END,
    delivered_at  = CASE WHEN p_next = 'delivered'::errand_status  THEN now() ELSE delivered_at  END,
    -- La durée de mission s'arrête à la remise, jamais à la confirmation.
    actual_minutes = CASE
      WHEN p_next = 'delivered'::errand_status
      THEN GREATEST(
        EXTRACT(EPOCH FROM (now() - COALESCE(shopping_at, started_at, created_at)))::integer / 60,
        0
      )
      ELSE actual_minutes
    END
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(
    p_errand_id,
    p_next,
    CASE WHEN p_next = 'delivered'::errand_status THEN 'Remise confirmée par code' ELSE NULL END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_advance_status(uuid, errand_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_advance_status(uuid, errand_status, text) TO authenticated;

-- L'acceptation d'une offre pose son propre jalon.
CREATE OR REPLACE FUNCTION public.errand_accept_offer(p_offer_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer      public.errand_offers;
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_commission numeric(12,2);
  v_base       numeric(12,2);
BEGIN
  SELECT * INTO v_offer FROM public.errand_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette offre n''existe plus.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = v_offer.errand_id FOR UPDATE;
  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut accepter une offre.' USING ERRCODE = '42501';
  END IF;
  IF v_errand.status <> 'open'::errand_status THEN
    RAISE EXCEPTION 'Cette course n''est plus ouverte aux offres.' USING ERRCODE = '22023';
  END IF;
  IF v_offer.status <> 'pending'::offer_status THEN
    RAISE EXCEPTION 'Cette offre n''est plus disponible.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_approved_runner(v_offer.runner_id) THEN
    RAISE EXCEPTION 'Ce shopper n''est pas validé.' USING ERRCODE = '42501';
  END IF;

  v_rule := public.current_commission_rule();
  v_base := GREATEST(v_offer.price, v_rule.min_service_fee);
  v_commission := round(v_base * v_rule.rate, 2);

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    runner_id         = v_offer.runner_id,
    status            = 'assigned'::errand_status,
    service_fee       = v_base,
    commission_rate   = v_rule.rate,
    commission_amount = v_commission,
    runner_payout     = v_base - v_commission,
    total_amount      = COALESCE(budget_estimate, 0) + v_base + COALESCE(delivery_fee, 0),
    started_at        = now(),
    accepted_at       = now()
  WHERE id = v_errand.id
  RETURNING * INTO v_errand;

  UPDATE public.errand_offers SET status = 'accepted'::offer_status WHERE id = p_offer_id;
  UPDATE public.errand_offers SET status = 'rejected'::offer_status
    WHERE errand_id = v_errand.id AND id <> p_offer_id AND status = 'pending'::offer_status;

  PERFORM public.log_errand_event(v_errand.id, 'assigned'::errand_status, 'Offre acceptée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_accept_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_accept_offer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le dépassement se mesure sur la mission, pas sur l'attente du client
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
  v_debut    timestamptz;
  v_fin      timestamptz;
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

  -- La mission court du départ effectif à la remise. Tant qu'elle n'est pas
  -- remise, le temps continue de courir : c'est bien le sujet.
  v_debut := COALESCE(v_errand.shopping_at, v_errand.started_at, v_errand.created_at);
  v_fin := COALESCE(v_errand.delivered_at, now());

  v_ecoulees := GREATEST(EXTRACT(EPOCH FROM (v_fin - v_debut))::integer / 60, 0);

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
-- 4. Un écart de budget important exige l'accord explicite du client
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_approve_budget_overrun(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client peut approuver un dépassement de budget.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    budget_overrun_pending = false,
    budget_approved_at     = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Dépassement de budget approuvé par le client');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_approve_budget_overrun(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_approve_budget_overrun(uuid) TO authenticated;

-- La facture signale l'écart au lieu de l'imposer.
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
  v_tolerance  numeric(12,2);
  v_ecart      boolean;
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

  -- Au delà de la tolérance, l'écart doit être approuvé par le client avant
  -- que la course puisse être clôturée.
  v_tolerance := GREATEST(
    COALESCE(v_errand.budget_estimate, 0) * v_rule.budget_tolerance_pct / 100,
    v_rule.budget_tolerance_min
  );
  v_ecart := p_items_total > COALESCE(v_errand.budget_estimate, 0) + v_tolerance;

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
    budget_overrun_pending = (v_ecart AND budget_approved_at IS NULL)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(
    p_errand_id,
    v_errand.status,
    CASE
      WHEN v_ecart THEN 'Facture enregistrée, dépassement de budget en attente d''accord du client'
      WHEN COALESCE(v_depass.overrun_fee, 0) > 0
        THEN 'Facture enregistrée, dépassement de ' || v_depass.overtime_minutes || ' min'
      ELSE 'Facture enregistrée'
    END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) TO authenticated;
