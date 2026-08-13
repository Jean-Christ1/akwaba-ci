-- Correction : publication d'une course par une fonction serveur
--
-- La politique d'insertion durcie impose commission_amount = 0 et
-- runner_payout = 0, ce qui est la bonne règle : un client ne doit pas pouvoir
-- fabriquer les montants de sa propre course. Mais l'écran de création envoyait
-- encore le devis calculé côté navigateur, si bien que toute publication
-- échouait.
--
-- Plutôt que d'assouplir la garde, on donne au client le seul chemin correct :
-- il décrit sa course, le serveur calcule le devis et pose le code de remise.

CREATE OR REPLACE FUNCTION public.errand_create(
  p_title             text,
  p_category          errand_category,
  p_city              text,
  p_zone              text,
  p_delivery_address  text,
  p_items             jsonb,
  p_budget_estimate   numeric,
  p_notes             text,
  p_preferred_contact text,
  p_scheduled_for     timestamptz,
  p_payment_method    pay_method,
  p_vehicle_required  text,
  p_volume_size       text,
  p_urgency           text,
  p_distance_km       numeric,
  p_estimated_minutes integer,
  p_dropoff_mode      dropoff_mode,
  p_third_party       text,
  p_fund_mode         fund_mode,
  p_lat               numeric DEFAULT NULL,
  p_lng               numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_rule       public.commission_rules;
  v_errand     public.errands;
  v_base       numeric(12,2);
  v_distance   numeric(12,2);
  v_minutes    integer;
  v_service    numeric(12,2);
  v_commission numeric(12,2);
  v_articles   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté pour publier une course.' USING ERRCODE = '42501';
  END IF;

  IF coalesce(char_length(trim(p_title)), 0) < 3 THEN
    RAISE EXCEPTION 'Le titre de la course est trop court.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(char_length(trim(p_delivery_address)), 0) < 3 THEN
    RAISE EXCEPTION 'L''adresse de remise est obligatoire.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_budget_estimate, 0) < 0 THEN
    RAISE EXCEPTION 'Le budget d''achat ne peut pas être négatif.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.current_commission_rule();
  v_distance := GREATEST(COALESCE(p_distance_km, 0), 0);
  v_minutes := GREATEST(COALESCE(p_estimated_minutes, 60), 0);
  v_articles := COALESCE(jsonb_array_length(p_items), 0);

  -- Barème serveur, aligné sur le moteur tarifaire affiché au client.
  v_base :=
    CASE p_vehicle_required
      WHEN 'a_pied'      THEN 500
      WHEN 'moto'        THEN 700
      WHEN 'tricycle'    THEN 1200
      WHEN 'voiture'     THEN 1500
      WHEN 'camionnette' THEN 3000
      ELSE 700
    END
    + v_distance *
      CASE p_vehicle_required
        WHEN 'a_pied'      THEN 100
        WHEN 'moto'        THEN 130
        WHEN 'tricycle'    THEN 160
        WHEN 'voiture'     THEN 200
        WHEN 'camionnette' THEN 300
        ELSE 120
      END
    + GREATEST(v_minutes - 30, 0) * 10
    + CASE p_volume_size
        WHEN 'medium' THEN 500
        WHEN 'large'  THEN 1500
        WHEN 'xl'     THEN 3000
        ELSE 0
      END
    + CASE p_urgency WHEN 'express' THEN 1000 ELSE 0 END
    + GREATEST(v_articles - 10, 0) * 50
    + CASE p_dropoff_mode
        WHEN 'customer_pickup' THEN -500
        WHEN 'third_party'     THEN -300
        ELSE 0
      END;

  -- Arrondi aux 50 francs, comme l'affichage, puis plancher de service.
  v_service := GREATEST(round(v_base / 50) * 50, v_rule.min_service_fee);
  v_commission := round(v_service * v_rule.rate, 2);

  INSERT INTO public.errands (
    customer_id, title, category, city, zone, delivery_address, lat, lng,
    items, budget_estimate, notes, preferred_contact, scheduled_for,
    payment_method, status, vehicle_required, volume_size, urgency,
    distance_km, estimated_minutes, dropoff_mode, third_party_contact,
    fund_mode, service_fee, commission_rate, commission_amount,
    runner_payout, total_amount, handover_code
  ) VALUES (
    v_uid, trim(p_title), p_category, p_city, NULLIF(trim(COALESCE(p_zone, '')), ''),
    trim(p_delivery_address), p_lat, p_lng,
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_budget_estimate, 0),
    NULLIF(trim(COALESCE(p_notes, '')), ''), COALESCE(p_preferred_contact, 'chat'),
    p_scheduled_for, COALESCE(p_payment_method, 'cash'::pay_method),
    'open'::errand_status, COALESCE(p_vehicle_required, 'any'),
    COALESCE(p_volume_size, 'small'), COALESCE(p_urgency, 'standard'),
    v_distance, v_minutes, COALESCE(p_dropoff_mode, 'runner_delivers'::dropoff_mode),
    NULLIF(trim(COALESCE(p_third_party, '')), ''),
    COALESCE(p_fund_mode, 'customer_advance'::fund_mode),
    v_service, v_rule.rate, v_commission,
    v_service - v_commission,
    COALESCE(p_budget_estimate, 0) + v_service,
    -- Code de remise tiré côté serveur : le client le découvre, personne ne le
    -- choisit, et il n'a jamais transite par le navigateur avant d'exister.
    lpad((floor(random() * 9000) + 1000)::int::text, 4, '0')
  )
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(v_errand.id, 'open'::errand_status, 'Course publiée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_create(
  text, errand_category, text, text, text, jsonb, numeric, text, text,
  timestamptz, pay_method, text, text, text, numeric, integer, dropoff_mode,
  text, fund_mode, numeric, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.errand_create(
  text, errand_category, text, text, text, jsonb, numeric, text, text,
  timestamptz, pay_method, text, text, text, numeric, integer, dropoff_mode,
  text, fund_mode, numeric, numeric
) TO authenticated;

-- ---------------------------------------------------------------------------
-- Le shopper doit pouvoir consulter une course ouverte pour se positionner
--
-- La politique de lecture avait été resserrée jusqu'à empêcher un shopper
-- d'ouvrir le détail d'une course du marché, donc de faire une offre éclairée.
-- On rétablit cet accès, sans revenir sur la confidentialité : les colonnes
-- sensibles restent hors de portée grâce à la vue de marché, et l'adresse
-- exacte n'a d'intérêt qu'une fois la course attribuée.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Errand visibility" ON public.errands;
CREATE POLICY "Errand visibility"
  ON public.errands FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR runner_id = auth.uid()
    OR (status = 'open'::errand_status AND public.is_approved_runner(auth.uid()))
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- L'adresse précise et les notes ne doivent pas rester lisibles avant
-- attribution. Elles sont donc masquées par une vue de détail que le front
-- consomme pour une course qui n'est pas encore la sienne.
CREATE OR REPLACE VIEW public.errand_market_detail AS
  SELECT
    e.id,
    e.title,
    e.category,
    e.city,
    e.zone,
    e.items,
    e.budget_estimate,
    e.service_fee,
    e.runner_payout,
    e.commission_amount,
    e.distance_km,
    e.estimated_minutes,
    e.urgency,
    e.volume_size,
    e.vehicle_required,
    e.dropoff_mode,
    e.fund_mode,
    e.payment_method,
    e.scheduled_for,
    e.status,
    e.created_at
  FROM public.errands e
  WHERE e.status = 'open'::errand_status
    AND public.is_approved_runner(auth.uid());

COMMENT ON VIEW public.errand_market_detail IS
  'Détail d''une course ouverte, tel qu''un shopper le voit avant attribution. Sans adresse exacte ni notes du client.';

GRANT SELECT ON public.errand_market_detail TO authenticated;

-- ---------------------------------------------------------------------------
-- Résolution d'un litige : les gains gelés doivent avoir une sortie
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_resolve_dispute(
  p_errand_id uuid,
  p_issue     text,
  p_note      text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_payout numeric(12,2);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut trancher un litige.' USING ERRCODE = '42501';
  END IF;

  IF p_issue NOT IN ('shopper', 'client', 'annulation') THEN
    RAISE EXCEPTION 'Issue de litige inconnue.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.status <> 'disputed'::errand_status THEN
    RAISE EXCEPTION 'Cette course n''est pas en litige.' USING ERRCODE = '22023';
  END IF;

  v_payout := GREATEST(COALESCE(v_errand.runner_payout, 0), 0);

  PERFORM set_config('app.errand_engine', 'on', true);

  IF p_issue = 'shopper' THEN
    -- Le shopper avait raison : ses gains lui sont rendus et la course est close.
    IF v_errand.runner_id IS NOT NULL AND v_payout > 0 THEN
      UPDATE public.runner_wallets
      SET pending_balance = pending_balance + v_payout
      WHERE user_id = v_errand.runner_id;

      INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
      VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind, v_payout,
              'Litige tranché en votre faveur', now());
    END IF;

    UPDATE public.errands
    SET status = 'completed'::errand_status, payment_status = 'paid'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

  ELSIF p_issue = 'client' THEN
    -- Le client avait raison : les gains restent retirés et la course est
    -- marquée remboursée.
    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'refunded'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

  ELSE
    UPDATE public.errands
    SET status = 'cancelled'::errand_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;
  END IF;

  PERFORM public.log_errand_event(
    p_errand_id,
    v_errand.status,
    'Litige tranché : ' || p_issue || COALESCE(', ' || left(trim(p_note), 400), '')
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_resolve_dispute(uuid, text, text) TO authenticated;

-- Une course livrée ne s'annule plus : elle se conteste.
CREATE OR REPLACE FUNCTION public.errand_cancel(
  p_errand_id uuid,
  p_reason    text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_is_customer boolean;
  v_is_runner   boolean;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  v_is_customer := v_errand.customer_id = auth.uid();
  v_is_runner   := v_errand.runner_id = auth.uid();

  IF NOT (v_is_customer OR v_is_runner
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status IN ('completed'::errand_status, 'cancelled'::errand_status) THEN
    RAISE EXCEPTION 'Cette course ne peut plus être annulée.' USING ERRCODE = '22023';
  END IF;

  -- Une fois la remise faite, le désaccord se règle par un litige, ce qui
  -- laisse une trace et un arbitre, là où une annulation effacerait le travail
  -- déjà accompli par le shopper.
  IF v_errand.status = 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course a été livrée : ouvrez un litige plutôt qu''une annulation.'
      USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Une course déjà réglée ne peut pas être annulée, ouvrez un litige.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  IF v_is_runner AND NOT v_is_customer AND v_errand.status IN ('assigned'::errand_status, 'shopping'::errand_status) THEN
    UPDATE public.errands SET
      runner_id = NULL,
      status    = 'open'::errand_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

    PERFORM public.log_errand_event(p_errand_id, 'open'::errand_status,
      COALESCE(NULLIF(p_reason, ''), 'Le shopper s''est désisté, la course est de nouveau ouverte'));
    RETURN v_errand;
  END IF;

  UPDATE public.errands SET status = 'cancelled'::errand_status
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, 'cancelled'::errand_status,
    COALESCE(NULLIF(p_reason, ''), 'Course annulée'));

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_cancel(uuid, text) TO authenticated;
