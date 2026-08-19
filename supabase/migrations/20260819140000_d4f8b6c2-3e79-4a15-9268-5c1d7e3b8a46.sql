-- ---------------------------------------------------------------------------
-- Un litige tranché en faveur du shopper le paie vraiment.
--
-- Le cas, tel qu'il se produit : une course à deux mille francs de frais de
-- service, en cours de livraison. Le client ouvre un litige, seul geste que
-- l'interface lui offre à ce moment. Aucune écriture n'existe encore au
-- portefeuille, puisque seule la confirmation de règlement en crée. Le
-- modérateur tranche « Donner raison au shopper ».
--
-- Ce qui se passe alors : la restitution calculée vaut zéro, faute de gel à
-- lever, donc rien n'est crédité. La course passe pourtant en « terminée » et
-- « payée ». Le shopper n'a rien touché, ni solde, ni dette de commission, ni
-- gain cumulé, ni course au compteur. La plateforme n'a inscrit aucune
-- commission. Et le client ne peut plus rien régler : la confirmation de
-- règlement sort immédiatement dès que la course est marquée payée.
--
-- Autrement dit, la décision du modérateur ferme le dossier en annonçant un
-- paiement qui n'a pas eu lieu, et rend impossible de le rattraper.
--
-- La cause est une duplication : la clôture financière n'existait que dans la
-- confirmation de règlement. Elle est extraite ici, une seule fois, et les deux
-- chemins l'appellent. Elle est idempotente, comme l'était l'originale : la
-- rejouer ne crédite pas deux fois.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_settle_runner(p_errand_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_payout     numeric(12,2);
  v_commission numeric(12,2);
  v_brut       numeric(12,2);
  v_creee      boolean := false;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND OR v_errand.runner_id IS NULL THEN
    RETURN;
  END IF;

  v_rule       := public.errand_commission_rule(p_errand_id);
  v_payout     := GREATEST(COALESCE(v_errand.runner_payout, 0), 0);
  v_commission := GREATEST(COALESCE(v_errand.commission_amount, 0), 0);
  v_brut       := v_payout + v_commission;

  INSERT INTO public.runner_wallets (user_id) VALUES (v_errand.runner_id)
    ON CONFLICT (user_id) DO NOTHING;

  IF v_rule.settlement = 'direct'::settlement_mode THEN
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
    SELECT v_errand.runner_id, v_errand.id, 'commission_due'::wallet_entry_kind,
           -v_commission, 'Commission due, course ' || left(v_errand.title, 60), now()
    WHERE v_commission > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_entries w
        WHERE w.errand_id = v_errand.id AND w.kind = 'commission_due'::wallet_entry_kind
      );
    GET DIAGNOSTICS v_creee = ROW_COUNT;

    IF v_creee THEN
      UPDATE public.runner_wallets SET
        commission_due    = commission_due + v_commission,
        lifetime_earnings = lifetime_earnings + v_payout
      WHERE user_id = v_errand.runner_id;

      UPDATE public.runner_profiles
      SET jobs_completed = jobs_completed + 1
      WHERE user_id = v_errand.runner_id;
    END IF;

  ELSE
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
    SELECT v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_brut,
           'Frais de service, course ' || left(v_errand.title, 60),
           now() + make_interval(hours => COALESCE(v_rule.hold_hours, 24))
    WHERE v_payout > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_entries w
        WHERE w.errand_id = v_errand.id AND w.kind = 'earning'::wallet_entry_kind
      );
    GET DIAGNOSTICS v_creee = ROW_COUNT;

    IF v_creee THEN
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

      UPDATE public.runner_profiles
      SET jobs_completed = jobs_completed + 1
      WHERE user_id = v_errand.runner_id;
    END IF;
  END IF;
END;
$fn$;

COMMENT ON FUNCTION public.errand_settle_runner(uuid) IS
  'Clôture financière d''une course pour le shopper. Idempotente. Appelée par la confirmation de règlement et par la résolution de litige, jamais depuis un client.';

REVOKE ALL ON FUNCTION public.errand_settle_runner(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- La confirmation de règlement délègue sa clôture, sans changer de règle.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_confirm_payment(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut confirmer le règlement.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RETURN v_errand;
  END IF;

  IF v_errand.status <> 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course doit être marquée comme livrée avant confirmation.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.budget_overrun_pending THEN
    RAISE EXCEPTION 'Le dépassement de budget doit être approuvé avant le règlement.'
      USING ERRCODE = '22023';
  END IF;

  IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
    RAISE EXCEPTION 'Le reçu des achats doit être déposé avant la clôture.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    status         = 'completed'::errand_status,
    payment_status = 'paid'::pay_status,
    updated_at     = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.errand_settle_runner(p_errand_id);

  PERFORM public.log_errand_event(p_errand_id, 'completed'::errand_status, 'Règlement confirmé par le client');

  RETURN v_errand;
END;
$fn$;

REVOKE ALL ON FUNCTION public.errand_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_payment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- La résolution de litige clôture elle aussi, quand rien ne l'a fait avant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_resolve_dispute(p_errand_id uuid, p_issue text, p_note text DEFAULT NULL::text)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_errand     public.errands;
  v_rendu      numeric(12,2) := 0;
  v_commission numeric(12,2) := 0;
  v_deja_paye  boolean;
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

  PERFORM set_config('app.errand_engine', 'on', true);

  SELECT COALESCE(-sum(amount), 0) INTO v_rendu
  FROM public.wallet_entries
  WHERE errand_id = p_errand_id AND kind = 'adjustment'::wallet_entry_kind;
  v_rendu := GREATEST(v_rendu, 0);

  -- La course a-t-elle déjà été clôturée financièrement ? Un litige ouvert
  -- avant tout règlement n'a rien à lever : il a tout à verser.
  SELECT EXISTS (
    SELECT 1 FROM public.wallet_entries
    WHERE errand_id = p_errand_id
      AND kind IN ('earning'::wallet_entry_kind,
                   'commission'::wallet_entry_kind,
                   'commission_due'::wallet_entry_kind)
  ) INTO v_deja_paye;

  IF p_issue = 'shopper' THEN
    IF v_errand.runner_id IS NOT NULL AND v_rendu > 0 THEN
      UPDATE public.runner_wallets
      SET available_balance = available_balance + v_rendu
      WHERE user_id = v_errand.runner_id;

      INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
      VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind, v_rendu,
              'Litige tranché en votre faveur', now());
    END IF;

    UPDATE public.errands
    SET status = 'completed'::errand_status, payment_status = 'paid'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

    -- Le point ajouté : marquer « payée » une course jamais réglée revenait à
    -- clore le dossier sur un paiement qui n'a pas eu lieu, sans plus aucun
    -- moyen de le rattraper.
    IF NOT v_deja_paye THEN
      PERFORM public.errand_settle_runner(p_errand_id);
    END IF;

  ELSIF p_issue = 'client' THEN
    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'refunded'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

  ELSE
    IF v_errand.runner_id IS NOT NULL THEN
      IF v_rendu > 0 THEN
        UPDATE public.runner_wallets
        SET available_balance = available_balance + v_rendu
        WHERE user_id = v_errand.runner_id;

        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind, v_rendu,
                'Litige clos sans versement, gel levé', now());
      END IF;

      SELECT COALESCE(-sum(amount), 0) INTO v_commission
      FROM public.wallet_entries
      WHERE errand_id = p_errand_id AND kind = 'commission_due'::wallet_entry_kind;

      IF v_commission > 0 THEN
        UPDATE public.runner_wallets
        SET commission_due = GREATEST(commission_due - v_commission, 0)
        WHERE user_id = v_errand.runner_id;

        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'commission_due'::wallet_entry_kind, v_commission,
                'Commission annulée, litige clos sans versement', now());
      END IF;
    END IF;

    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'failed'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    CASE p_issue
      WHEN 'shopper' THEN 'Litige tranché en faveur du shopper'
      WHEN 'client' THEN 'Litige tranché en faveur du client'
      ELSE 'Litige clos sans versement'
    END ||
    CASE WHEN p_note IS NOT NULL THEN ' : ' || left(trim(p_note), 400) ELSE '' END);

  PERFORM public.log_audit('resolve', 'dispute', p_errand_id::text,
    jsonb_build_object('issue', p_issue, 'rendu', v_rendu,
                       'commission_annulee', v_commission, 'cloture_effectuee', NOT v_deja_paye));

  RETURN v_errand;
END;
$fn$;

REVOKE ALL ON FUNCTION public.errand_resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_resolve_dispute(uuid, text, text) TO authenticated;
