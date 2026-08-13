-- ---------------------------------------------------------------------------
-- La clôture applique le mode de règlement de la course.
--
-- En mode direct, qui est celui d'aujourd'hui puisque aucun agrégateur n'est
-- branché : le client a réglé le shopper de la totalité, donc la plateforme ne
-- crédite rien et inscrit au débit du shopper la commission qu'il lui doit.
--
-- En mode escrow : la plateforme a encaissé le client, elle porte au crédit du
-- shopper son gain net et conserve sa commission. C'est l'ancien comportement,
-- conservé parce qu'il redeviendra juste le jour où un encaissement existera.
--
-- Le mode est lu sur le barème figé de la course, jamais sur le barème courant :
-- changer de modèle en cours de route ne doit pas re-liquider les missions
-- déjà en vol.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_confirm_payment(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Idempotence d'abord : la clôture fait passer la course de « livrée » à
  -- « terminée », si bien qu'un contrôle de statut placé avant renverrait une
  -- erreur au client dont le paiement vient pourtant d'aboutir.
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
    updated_at     = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF v_errand.runner_id IS NOT NULL THEN
    INSERT INTO public.runner_wallets (user_id) VALUES (v_errand.runner_id)
      ON CONFLICT (user_id) DO NOTHING;

    IF v_rule.settlement = 'direct'::settlement_mode THEN
      -- Le shopper a encaissé le client. Il doit sa commission à la plateforme.
      INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
      SELECT v_errand.runner_id, v_errand.id, 'commission_due'::wallet_entry_kind,
             -v_commission, 'Commission due, course ' || left(v_errand.title, 60), now()
      WHERE v_commission > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.wallet_entries w
          WHERE w.errand_id = v_errand.id AND w.kind = 'commission_due'::wallet_entry_kind
        );

      UPDATE public.runner_wallets SET
        commission_due    = commission_due + v_commission,
        lifetime_earnings = lifetime_earnings + v_payout
      WHERE user_id = v_errand.runner_id;

    ELSE
      -- La plateforme a encaissé : elle porte le gain net au crédit du shopper.
      INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
      SELECT v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_brut,
             'Frais de service, course ' || left(v_errand.title, 60),
             now() + make_interval(hours => COALESCE(v_rule.hold_hours, 24))
      WHERE v_payout > 0
        AND NOT EXISTS (
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

      UPDATE public.runner_wallets SET
        pending_balance   = pending_balance + v_payout,
        lifetime_earnings = lifetime_earnings + v_payout
      WHERE user_id = v_errand.runner_id;
    END IF;

    UPDATE public.runner_profiles
    SET jobs_completed = jobs_completed + 1
    WHERE user_id = v_errand.runner_id;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'completed'::errand_status, 'Règlement confirmé par le client');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_payment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Enregistrement d'un règlement de commission.
--
-- Le shopper verse à la plateforme ce qu'il lui doit, par le canal convenu.
-- Un membre du personnel constate le versement et l'inscrit ici. La saisie est
-- journalisée nominativement : c'est une opération d'encaissement, elle doit
-- pouvoir être rapprochée d'un relevé.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commission_settlement_record(
  p_runner_id uuid,
  p_amount    numeric,
  p_reference text DEFAULT NULL
)
RETURNS public.runner_wallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wallet public.runner_wallets;
  v_montant numeric(12,2);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul le personnel de la plateforme peut constater un règlement.'
      USING ERRCODE = '42501';
  END IF;

  v_montant := round(COALESCE(p_amount, 0), 2);
  IF v_montant <= 0 THEN
    RAISE EXCEPTION 'Le montant d''un règlement doit être positif.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_wallet FROM public.runner_wallets WHERE user_id = p_runner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce shopper n''a pas de compte.' USING ERRCODE = 'P0002';
  END IF;

  -- On refuse d'encaisser plus que ce qui est dû : le trop-perçu se règle par
  -- un remboursement, pas par un solde négatif que personne ne saurait lire.
  IF v_montant > v_wallet.commission_due THEN
    RAISE EXCEPTION 'Le règlement dépasse la commission due (%).', v_wallet.commission_due
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.wallet_entries (user_id, kind, amount, label, released_at)
  VALUES (p_runner_id, 'commission_settlement'::wallet_entry_kind, v_montant,
          'Règlement de commission' || CASE WHEN p_reference IS NOT NULL
             THEN ', référence ' || left(trim(p_reference), 80) ELSE '' END,
          now());

  UPDATE public.runner_wallets SET
    commission_due     = commission_due - v_montant,
    commission_settled = commission_settled + v_montant
  WHERE user_id = p_runner_id
  RETURNING * INTO v_wallet;

  PERFORM public.log_audit('settle', 'commission', p_runner_id::text,
    jsonb_build_object('montant', v_montant, 'reference', p_reference));

  RETURN v_wallet;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_settlement_record(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_settlement_record(uuid, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ce que la plateforme doit encaisser, par shopper.
--
-- Sans cette vue, la commission due n'est visible nulle part et personne ne
-- sait à qui la réclamer : elle resterait une ligne de journal, pas un revenu.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.commission_receivables
WITH (security_invoker = on)
AS
SELECT
  w.user_id                                   AS runner_id,
  r.full_name,
  r.phone,
  w.commission_due,
  w.commission_settled,
  w.lifetime_earnings,
  r.jobs_completed,
  (SELECT max(e.created_at) FROM public.wallet_entries e
    WHERE e.user_id = w.user_id AND e.kind = 'commission_due'::wallet_entry_kind) AS derniere_commission
FROM public.runner_wallets w
JOIN public.runner_profiles r ON r.user_id = w.user_id
WHERE w.commission_due > 0;

GRANT SELECT ON public.commission_receivables TO authenticated;

-- Le personnel doit voir toutes les créances, pas seulement les siennes.
DROP POLICY IF EXISTS "Staff read wallets" ON public.runner_wallets;
CREATE POLICY "Staff read wallets"
  ON public.runner_wallets FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );
