-- Lisibilité financière côté client
--
-- Le mode de financement recommandé demande au client d'envoyer le budget
-- d'achat au shopper avant qu'il ne parte. Or l'application ne lui indiquait
-- nulle part sur quel compte l'envoyer : la promesse était donc intenable, et
-- le client n'avait d'autre choix que de demander le numéro par la messagerie.
--
-- On expose le compte de réception du shopper, mais uniquement au client de la
-- course sur laquelle ce shopper est effectivement assigné.

CREATE OR REPLACE FUNCTION public.errand_runner_payout_account(p_errand_id uuid)
RETURNS TABLE (
  provider       momo_provider,
  account_number text,
  account_name   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;

  IF NOT FOUND OR v_errand.runner_id IS NULL THEN
    RETURN;
  END IF;

  -- Seul le client de la course, et le shopper concerné, y ont accès.
  IF v_errand.customer_id <> auth.uid() AND v_errand.runner_id <> auth.uid() THEN
    RETURN;
  END IF;

  -- Un compte n'est communiqué qu'une fois la course réellement engagée.
  IF v_errand.status NOT IN (
    'assigned'::errand_status, 'shopping'::errand_status,
    'delivering'::errand_status, 'delivered'::errand_status
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT a.provider, a.account_number, a.account_name
  FROM public.runner_payout_accounts a
  WHERE a.user_id = v_errand.runner_id
  ORDER BY a.is_default DESC, a.created_at
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_runner_payout_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_runner_payout_account(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Déclaration de l'avance envoyée
--
-- Le client indique le montant qu'il a transféré. Le serveur le consigne et
-- recalcule le reste à payer, au lieu de laisser ce montant à l'appréciation
-- de chacun.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_declare_advance(
  p_errand_id uuid,
  p_amount    numeric
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Le montant de l''avance ne peut pas être négatif.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut déclarer son avance.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    advance_amount       = p_amount,
    advance_confirmed_at = now(),
    balance_due          = GREATEST(COALESCE(total_amount, 0) - p_amount, 0)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  INSERT INTO public.errand_payments (errand_id, payer_id, kind, method, amount, confirmed_at)
  VALUES (p_errand_id, auth.uid(), 'shopping_advance'::errand_payment_kind,
          v_errand.payment_method, p_amount, now());

  PERFORM public.log_errand_event(p_errand_id, v_errand.status, 'Avance déclarée par le client');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_declare_advance(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_declare_advance(uuid, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Historique financier d'une course, lisible par ses participants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.errand_payment_history AS
  SELECT
    p.id,
    p.errand_id,
    p.kind,
    p.method,
    p.amount,
    p.reference,
    p.confirmed_at,
    p.created_at
  FROM public.errand_payments p
  WHERE public.is_errand_participant(p.errand_id, auth.uid())
     OR public.has_role(auth.uid(), 'admin'::app_role);

COMMENT ON VIEW public.errand_payment_history IS
  'Mouvements financiers d''une course, visibles par ses participants. N''expose ni le payeur ni la preuve.';

GRANT SELECT ON public.errand_payment_history TO authenticated;
