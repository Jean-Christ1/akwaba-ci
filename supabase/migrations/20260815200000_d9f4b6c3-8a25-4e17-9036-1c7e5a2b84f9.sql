-- ---------------------------------------------------------------------------
-- Deux acceptations simultanées se soldaient par un interblocage.
--
-- errand_accept_offer verrouillait l'offre d'abord, puis la course. Deux
-- acceptations portant sur deux offres différentes de la MÊME course prenaient
-- donc leurs verrous dans un ordre opposé : PostgreSQL détectait l'interblocage
-- et sacrifiait l'une des transactions.
--
-- Le résultat final était juste, un seul shopper affecté, mais pour une
-- mauvaise raison : c'est l'ordre de verrouillage qui tranchait, pas une règle.
-- Et l'utilisateur perdant recevait « deadlock detected », message que le
-- support ne peut pas expliquer.
--
-- Reproduit en conditions réelles avant correction : deux clients acceptant en
-- parallèle, l'un recevait 40P01.
--
-- La course est désormais verrouillée en premier. Toutes les transactions
-- prennent leurs verrous dans le même ordre, l'interblocage devient impossible,
-- et la seconde acceptation reçoit le refus métier qu'elle mérite.
--
-- La fonction est reprise depuis sa définition en base, et non réécrite de
-- mémoire : elle pose aussi started_at et remet à zéro les compteurs de remise,
-- qu'une réécriture approximative aurait perdus.
-- ---------------------------------------------------------------------------

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

REVOKE ALL ON FUNCTION public.errand_accept_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_accept_offer(uuid) TO authenticated;
