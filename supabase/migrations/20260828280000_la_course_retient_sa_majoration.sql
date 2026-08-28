CREATE OR REPLACE FUNCTION public.errand_create(p_title text, p_category errand_category, p_city text, p_zone text, p_delivery_address text, p_items jsonb, p_budget_estimate numeric, p_notes text, p_preferred_contact text, p_scheduled_for timestamp with time zone, p_payment_method pay_method, p_vehicle_required text, p_volume_size text, p_urgency text, p_distance_km numeric, p_estimated_minutes integer, p_dropoff_mode dropoff_mode, p_third_party text, p_fund_mode fund_mode, p_lat numeric DEFAULT NULL::numeric, p_lng numeric DEFAULT NULL::numeric)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_rule   public.commission_rules;
  v_errand public.errands;
  v_devis  jsonb;
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

  v_rule  := public.current_commission_rule();
  v_devis := public.pricing_quote(
    p_city, COALESCE(p_vehicle_required, 'any'), COALESCE(p_volume_size, 'small'),
    COALESCE(p_urgency, 'standard'), COALESCE(p_dropoff_mode, 'runner_delivers')::text,
    GREATEST(COALESCE(p_distance_km, 0), 0), GREATEST(COALESCE(p_estimated_minutes, 60), 0),
    COALESCE(jsonb_array_length(p_items), 0)
  );

  INSERT INTO public.errands (
    customer_id, title, category, city, zone, delivery_address, lat, lng,
    items, budget_estimate, notes, preferred_contact, scheduled_for,
    payment_method, status, vehicle_required, volume_size, urgency,
    distance_km, estimated_minutes, dropoff_mode, third_party_contact,
    fund_mode, service_fee, commission_rate, commission_amount,
    runner_payout, total_amount, handover_code, commission_rule_id, pricing_rule_id,
    surge_fee, surge_reason
  ) VALUES (
    v_uid, trim(p_title), p_category, p_city, NULLIF(trim(COALESCE(p_zone, '')), ''),
    trim(p_delivery_address), p_lat, p_lng,
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_budget_estimate, 0),
    NULLIF(trim(COALESCE(p_notes, '')), ''), COALESCE(p_preferred_contact, 'chat'),
    p_scheduled_for, COALESCE(p_payment_method, 'cash'::pay_method),
    'open'::errand_status, COALESCE(p_vehicle_required, 'any'),
    COALESCE(p_volume_size, 'small'), COALESCE(p_urgency, 'standard'),
    GREATEST(COALESCE(p_distance_km, 0), 0), GREATEST(COALESCE(p_estimated_minutes, 60), 0),
    COALESCE(p_dropoff_mode, 'runner_delivers'::dropoff_mode),
    NULLIF(trim(COALESCE(p_third_party, '')), ''),
    COALESCE(p_fund_mode, 'customer_advance'::fund_mode),
    (v_devis->>'serviceFee')::numeric, v_rule.rate, (v_devis->>'commission')::numeric,
    (v_devis->>'runnerPayout')::numeric,
    COALESCE(p_budget_estimate, 0) + (v_devis->>'serviceFee')::numeric,
    public.generate_handover_code(),
    -- Le barème appliqué est celui du jour de la publication, et il ne bougera
    -- plus : c'est celui que le client a vu au moment de s'engager.
    v_rule.id,
    (v_devis->>'ruleId')::uuid,
    -- La course retient ce que la majoration lui a ajoute. Sans cette
    -- memoire, l'acceptation d'une offre recalculait la commission sur le
    -- prix majore, et Akwaba reprenait quinze pour cent du supplement.
    COALESCE((v_devis->>'surgeFee')::numeric, 0),
    v_devis->>'surgeReason'
  )
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(v_errand.id, 'open'::errand_status, 'Course publiée');

  RETURN v_errand;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.errand_accept_offer(p_offer_id uuid)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offer      public.errand_offers;
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_commission numeric(12,2);
  v_base       numeric(12,2);
BEGIN
  -- L'offre est lue sans verrou : on ne s'en sert ici que pour savoir quelle
  -- course verrouiller.
  SELECT * INTO v_offer FROM public.errand_offers WHERE id = p_offer_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette offre n''existe plus.' USING ERRCODE = 'P0002';
  END IF;

  -- La course en premier : c'est elle que toutes les acceptations concurrentes
  -- se disputent, donc c'est elle que tout le monde doit prendre en premier.
  SELECT * INTO v_errand FROM public.errands WHERE id = v_offer.errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Un shopper déjà retenu est le cas de la seconde acceptation : on le nomme,
  -- plutôt que de laisser l'utilisateur devant un message générique.
  IF v_errand.runner_id IS NOT NULL THEN
    RAISE EXCEPTION 'Un shopper a déjà été retenu pour cette course.' USING ERRCODE = '22023';
  END IF;

  -- L'offre ensuite, relue sous verrou : son état a pu changer entre les deux.
  SELECT * INTO v_offer FROM public.errand_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette offre n''existe plus.' USING ERRCODE = 'P0002';
  END IF;

  
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

  v_rule := public.errand_commission_rule(v_errand.id);
  v_base := GREATEST(v_offer.price, v_rule.min_service_fee);
  -- La commission ne porte jamais sur la majoration : le supplement existe
  -- pour convaincre un shopper de sortir, pas pour enrichir la plateforme
  -- d'une penurie. Le prix de l'offre la contient, puisque c'est ce que le
  -- shopper a vu ; on la retranche avant de calculer, sans jamais descendre
  -- sous le plancher de frais.
  v_commission := round(
    public.commission_hors_majoration(v_base, v_errand.surge_fee, v_rule.min_service_fee)
      * v_rule.rate, 2);

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
    accepted_at       = now(),
    -- Une course publiée avant la mise en place du barème figé se voit
    -- rattacher celui sous lequel elle est réellement engagée.
    commission_rule_id = COALESCE(commission_rule_id, v_rule.id),
    -- Un shopper qui se désiste rend la course au marché : la remise déjà
    -- vérifiée avec lui ne doit rien valoir pour son successeur, sinon le
    -- suivant livrerait sans jamais rencontrer le client.
    handover_verified_at = NULL,
    handover_attempts    = 0,
    handover_locked_at   = NULL
  WHERE id = v_errand.id
  RETURNING * INTO v_errand;

  UPDATE public.errand_offers SET status = 'accepted'::offer_status WHERE id = p_offer_id;
  UPDATE public.errand_offers SET status = 'rejected'::offer_status
    WHERE errand_id = v_errand.id AND id <> p_offer_id AND status = 'pending'::offer_status;

  PERFORM public.log_errand_event(v_errand.id, 'assigned'::errand_status, 'Offre acceptée');

  RETURN v_errand;
END;
$function$
;
