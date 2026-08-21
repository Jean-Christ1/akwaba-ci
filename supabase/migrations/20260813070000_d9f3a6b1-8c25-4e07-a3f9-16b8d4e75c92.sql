-- Lot C : securisation du portefeuille shopper et des retraits
--
-- Corrige la faille P1 confirmee en base : la politique d'insertion de
-- payout_requests ne verifiait que amount > 0, sans aucune comparaison au solde
-- disponible, et aucun trigger ne debitait le portefeuille. Le plafonnement
-- etait purement cote client, donc contournable par appel direct.
--
-- Ajoute egalement la maturation des gains : le credit d'une course arrive en
-- solde en attente, puis bascule en solde disponible apres le delai anti-litige
-- defini dans le bareme (commission_rules.hold_hours).

-- ---------------------------------------------------------------------------
-- 1. Tracabilite de la maturation
-- ---------------------------------------------------------------------------

ALTER TABLE public.wallet_entries
  ADD COLUMN IF NOT EXISTS matures_at  timestamptz,
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

COMMENT ON COLUMN public.wallet_entries.matures_at IS
  'Date a partir de laquelle un gain peut basculer du solde en attente vers le solde disponible.';
COMMENT ON COLUMN public.wallet_entries.released_at IS
  'Date effective de bascule vers le solde disponible. Nul tant que le gain est en attente.';

CREATE INDEX IF NOT EXISTS idx_wallet_entries_user ON public.wallet_entries (user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_entries_maturation
  ON public.wallet_entries (matures_at) WHERE released_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payout_requests_user ON public.payout_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_payout_requests_status ON public.payout_requests (status);

-- ---------------------------------------------------------------------------
-- 2. Le credit d'une course pose desormais une date de maturation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_confirm_payment(
  p_errand_id uuid
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_rule   public.commission_rules;
  v_payout numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut confirmer le règlement.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status <> 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course doit être marquée comme livrée avant confirmation.' USING ERRCODE = '22023';
  END IF;

  -- Idempotence : une course deja reglee ne credite jamais deux fois.
  IF v_errand.payment_status = 'paid'::pay_status THEN
    RETURN v_errand;
  END IF;

  IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
    RAISE EXCEPTION 'Le reçu des achats doit être déposé avant la clôture.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.current_commission_rule();
  v_payout := GREATEST(COALESCE(v_errand.runner_payout, 0), 0);

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
    -- Une seule entree de gain par course, quelle que soit la repetition d'appel.
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
    SELECT v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_payout,
           'Gain de la course ' || left(v_errand.title, 80),
           now() + make_interval(hours => COALESCE(v_rule.hold_hours, 24))
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_entries w
      WHERE w.errand_id = v_errand.id AND w.kind = 'earning'::wallet_entry_kind
    );

    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
    SELECT v_errand.runner_id, v_errand.id, 'commission'::wallet_entry_kind,
           -COALESCE(v_errand.commission_amount, 0), 'Commission Akwaba', now()
    WHERE NOT EXISTS (
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
$$;

REVOKE ALL ON FUNCTION public.errand_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_payment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bascule des gains arrives a maturite vers le solde disponible
--
-- Appelable par le shopper lui-meme a l'ouverture de son portefeuille, et
-- idempotente : une entree deja liberee n'est jamais recomptee.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_release_matured_earnings()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_total  numeric(12,2) := 0;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 0;
  END IF;

  WITH matured AS (
    UPDATE public.wallet_entries
    SET released_at = now()
    WHERE user_id = v_uid
      AND kind = 'earning'::wallet_entry_kind
      AND released_at IS NULL
      AND matures_at IS NOT NULL
      AND matures_at <= now()
    RETURNING amount
  )
  SELECT COALESCE(sum(amount), 0) INTO v_total FROM matured;

  IF v_total > 0 THEN
    UPDATE public.runner_wallets SET
      pending_balance   = GREATEST(pending_balance - v_total, 0),
      available_balance = available_balance + v_total
    WHERE user_id = v_uid;
  END IF;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.wallet_release_matured_earnings() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.wallet_release_matured_earnings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Demande de retrait : controle serveur du solde et debit atomique
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payout_request_create(
  p_amount     numeric,
  p_account_id uuid DEFAULT NULL
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_wallet  public.runner_wallets;
  v_rule    public.commission_rules;
  v_request public.payout_requests;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté pour demander un retrait.' USING ERRCODE = '42501';
  END IF;

  v_rule := public.current_commission_rule();

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Le montant du retrait doit être positif.' USING ERRCODE = '22023';
  END IF;

  IF p_amount < v_rule.min_payout THEN
    RAISE EXCEPTION 'Le retrait minimum est de % FCFA.', v_rule.min_payout USING ERRCODE = '22023';
  END IF;

  IF p_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.runner_payout_accounts a
    WHERE a.id = p_account_id AND a.user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Ce compte de retrait ne vous appartient pas.' USING ERRCODE = '42501';
  END IF;

  -- Verrou de ligne : deux demandes simultanees ne peuvent pas depenser le meme solde.
  SELECT * INTO v_wallet FROM public.runner_wallets WHERE user_id = v_uid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aucun portefeuille associé à votre compte.' USING ERRCODE = 'P0002';
  END IF;

  IF p_amount > v_wallet.available_balance THEN
    RAISE EXCEPTION 'Montant supérieur à votre solde disponible.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.runner_wallets
  SET available_balance = available_balance - p_amount
  WHERE user_id = v_uid;

  INSERT INTO public.payout_requests (user_id, account_id, amount, status)
  VALUES (v_uid, p_account_id, p_amount, 'requested'::payout_status)
  RETURNING * INTO v_request;

  INSERT INTO public.wallet_entries (user_id, kind, amount, label, released_at)
  VALUES (v_uid, 'payout'::wallet_entry_kind, -p_amount, 'Demande de retrait', now());

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.payout_request_create(numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payout_request_create(numeric, uuid) TO authenticated;

-- L'insertion directe n'est plus possible : elle contournerait le debit.
DROP POLICY IF EXISTS "Own payout requests create" ON public.payout_requests;

-- ---------------------------------------------------------------------------
-- 5. Traitement administrateur d'une demande de retrait
--
-- Un rejet recredite le solde du shopper, un paiement le laisse debite.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.payout_request_settle(
  p_request_id uuid,
  p_status     payout_status,
  p_reference  text DEFAULT NULL,
  p_note       text DEFAULT NULL
)
RETURNS public.payout_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.payout_requests;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Seul un administrateur peut traiter une demande de retrait.' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('processing'::payout_status, 'paid'::payout_status, 'rejected'::payout_status) THEN
    RAISE EXCEPTION 'Statut de retrait invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.payout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de retrait introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status IN ('paid'::payout_status, 'rejected'::payout_status) THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée.' USING ERRCODE = '22023';
  END IF;

  -- Un rejet rend les fonds au shopper.
  IF p_status = 'rejected'::payout_status THEN
    UPDATE public.runner_wallets
    SET available_balance = available_balance + v_request.amount
    WHERE user_id = v_request.user_id;

    INSERT INTO public.wallet_entries (user_id, kind, amount, label, released_at)
    VALUES (v_request.user_id, 'adjustment'::wallet_entry_kind, v_request.amount,
            'Retrait refusé, montant recrédité', now());
  END IF;

  UPDATE public.payout_requests SET
    status             = p_status,
    transfer_reference = COALESCE(p_reference, transfer_reference),
    admin_note         = COALESCE(p_note, admin_note)
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.payout_request_settle(uuid, payout_status, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payout_request_settle(uuid, payout_status, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Comptes de retrait : le shopper ne peut pas se declarer verifie
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_payout_account_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Un compte de retrait ne peut pas changer de propriétaire.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_payout_account_columns() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_payout_accounts_guard ON public.runner_payout_accounts;
CREATE TRIGGER trg_payout_accounts_guard
  BEFORE UPDATE ON public.runner_payout_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_payout_account_columns();
