-- ---------------------------------------------------------------------------
-- La confirmation de paiement redevient idempotente.
--
-- Le court-circuit qui rend une course déjà réglée existait, mais il était
-- placé après le contrôle du statut. Or la clôture fait passer la course de
-- « livrée » à « terminée » : au second appel, le contrôle de statut refusait
-- avant que le court-circuit soit atteint.
--
-- Conséquence pour le client : un double clic sur « Confirmer le paiement »
-- affichait « La course doit être marquée comme livrée » alors que son
-- règlement venait d'aboutir. De quoi le pousser à recommencer, ou à appeler
-- le support pour un problème qui n'existe pas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_confirm_payment(p_errand_id uuid)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_payout     numeric(12,2);
  v_commission numeric(12,2);
  v_brut       numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut confirmer le règlement.' USING ERRCODE = '42501';
  END IF;

  -- Idempotence d'abord : une course déjà réglée est rendue telle quelle. Ce
  -- contrôle doit précéder celui du statut, car la clôture fait passer la
  -- course de « livrée » à « terminée » : placé après, il n'était jamais
  -- atteint et un second appel, un simple double clic, renvoyait une erreur au
  -- client dont le paiement avait pourtant abouti.
  IF v_errand.payment_status = 'paid'::pay_status THEN
    RETURN v_errand;
  END IF;

  IF v_errand.status <> 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course doit être marquée comme livrée avant confirmation.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
    RAISE EXCEPTION 'Le reçu des achats doit être déposé avant la clôture.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.errand_commission_rule(p_errand_id);
  v_payout := GREATEST(COALESCE(v_errand.runner_payout, 0), 0);
  v_commission := GREATEST(COALESCE(v_errand.commission_amount, 0), 0);
  v_brut := v_payout + v_commission;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    status         = 'completed'::errand_status,
    payment_status = 'paid'::pay_status,
    actual_minutes = COALESCE(
      actual_minutes,
      GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at)))::integer / 60, 0)
    )
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF v_errand.runner_id IS NOT NULL AND v_payout > 0 THEN
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
    SELECT v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_brut,
           'Frais de service, course ' || left(v_errand.title, 60),
           now() + make_interval(hours => COALESCE(v_rule.hold_hours, 24))
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_entries w
      WHERE w.errand_id = v_errand.id AND w.kind = 'earning'::wallet_entry_kind
    );

    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
    SELECT v_errand.runner_id, v_errand.id, 'commission'::wallet_entry_kind,
           -v_commission, 'Commission Akwaba', now()
    WHERE v_commission > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_entries w
        WHERE w.errand_id = v_errand.id AND w.kind = 'commission'::wallet_entry_kind
      );

    INSERT INTO public.runner_wallets (user_id) VALUES (v_errand.runner_id)
      ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.runner_wallets SET
      pending_balance   = pending_balance + v_payout,
      lifetime_earnings = lifetime_earnings + v_payout
    WHERE user_id = v_errand.runner_id;

    UPDATE public.runner_profiles SET jobs_completed = jobs_completed + 1
    WHERE user_id = v_errand.runner_id;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'completed'::errand_status, 'Course réglée et clôturée');

  RETURN v_errand;
END;
$function$
;
