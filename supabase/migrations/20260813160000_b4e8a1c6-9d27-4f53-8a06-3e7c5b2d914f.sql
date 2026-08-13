-- Corrections complémentaires issues de la vérification adversariale

-- ---------------------------------------------------------------------------
-- 1. Le journal du portefeuille retranchait la commission deux fois
--
-- Le crédit inscrivait une entrée de gain déjà nette de commission, puis une
-- seconde entrée négative pour cette même commission. La somme du journal ne
-- correspondait donc plus au solde réellement crédité, ce qui rend tout
-- rapprochement comptable impossible et inquiète légitimement le shopper.
--
-- Le journal enregistre désormais le montant brut des frais de service, puis la
-- commission retenue : leur somme redonne exactement le gain porté au solde.
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

  IF v_errand.status <> 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course doit être marquée comme livrée avant confirmation.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RETURN v_errand;
  END IF;

  IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
    RAISE EXCEPTION 'Le reçu des achats doit être déposé avant la clôture.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.current_commission_rule();
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
    -- Montant brut des frais de service.
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
    SELECT v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_brut,
           'Frais de service, course ' || left(v_errand.title, 60),
           now() + make_interval(hours => COALESCE(v_rule.hold_hours, 24))
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_entries w
      WHERE w.errand_id = v_errand.id AND w.kind = 'earning'::wallet_entry_kind
    );

    -- Commission retenue : la somme des deux lignes redonne le gain net.
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
$$;

REVOKE ALL ON FUNCTION public.errand_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_payment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Le gel des gains en litige doit rester cohérent après maturation
--
-- Le gel retirait le montant du solde en attente, sans considérer que les gains
-- avaient pu déjà basculer en solde disponible : il pouvait alors ne rien geler
-- du tout. Le gel puise désormais d'abord dans le solde en attente, puis dans le
-- disponible, et l'entrée de journal correspondante rend l'opération traçable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_open_dispute(
  p_errand_id uuid,
  p_reason    text
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand    public.errands;
  v_wallet    public.runner_wallets;
  v_a_geler   numeric(12,2);
  v_du_pending numeric(12,2);
  v_du_dispo   numeric(12,2);
BEGIN
  IF coalesce(char_length(trim(p_reason)), 0) < 10 THEN
    RAISE EXCEPTION 'Merci de décrire le litige en quelques mots (10 caractères minimum).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_errand_participant(p_errand_id, auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status IN ('cancelled'::errand_status, 'disputed'::errand_status) THEN
    RAISE EXCEPTION 'Un litige est déjà ouvert ou la course est annulée.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET status = 'disputed'::errand_status
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF v_errand.runner_id IS NOT NULL THEN
    v_a_geler := GREATEST(COALESCE(v_errand.runner_payout, 0), 0);

    SELECT * INTO v_wallet FROM public.runner_wallets
    WHERE user_id = v_errand.runner_id FOR UPDATE;

    IF FOUND AND v_a_geler > 0 THEN
      -- On gèle d'abord ce qui est encore en attente, puis, si les gains ont
      -- déjà mûri, ce qui est passé en disponible.
      v_du_pending := LEAST(v_wallet.pending_balance, v_a_geler);
      v_du_dispo := LEAST(v_wallet.available_balance, v_a_geler - v_du_pending);

      UPDATE public.runner_wallets SET
        pending_balance   = pending_balance - v_du_pending,
        available_balance = available_balance - v_du_dispo
      WHERE user_id = v_errand.runner_id;

      IF v_du_pending + v_du_dispo > 0 THEN
        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind,
                -(v_du_pending + v_du_dispo), 'Gains gelés, litige en cours', now());
      END IF;
    END IF;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'disputed'::errand_status, left(trim(p_reason), 500));

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_open_dispute(uuid, text) TO authenticated;

-- Un litige tranché en faveur du shopper rend les gains en solde disponible,
-- puisqu'ils ont déjà purgé leur délai d'attente pendant l'instruction.
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
  v_rendu  numeric(12,2);
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

  IF p_issue = 'shopper' THEN
    -- On rend exactement ce qui avait été gelé pour cette course.
    SELECT COALESCE(-sum(amount), 0) INTO v_rendu
    FROM public.wallet_entries
    WHERE errand_id = p_errand_id
      AND kind = 'adjustment'::wallet_entry_kind
      AND amount < 0;

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

  ELSIF p_issue = 'client' THEN
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

-- ---------------------------------------------------------------------------
-- 3. Le client pouvait réécrire le prix d'une offre avant de l'accepter
--
-- La politique de mise à jour des offres n'avait aucune garde de colonne : le
-- client pouvait ramener le prix proposé par le shopper à la valeur de son
-- choix, puis accepter. Un prix n'appartient qu'à celui qui le propose.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_offer_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR current_setting('app.errand_engine', true) = 'on'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  -- Seul le shopper qui a émis l'offre peut en changer les termes, et seulement
  -- tant qu'elle est en attente.
  IF (NEW.price IS DISTINCT FROM OLD.price
      OR NEW.eta_minutes IS DISTINCT FROM OLD.eta_minutes)
     AND (OLD.runner_id <> auth.uid() OR OLD.status <> 'pending'::offer_status) THEN
    RAISE EXCEPTION 'Le prix d''une offre ne peut être modifié que par le shopper qui l''a proposée.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.runner_id IS DISTINCT FROM OLD.runner_id
     OR NEW.errand_id IS DISTINCT FROM OLD.errand_id THEN
    RAISE EXCEPTION 'Une offre ne peut pas changer d''auteur ni de course.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_errand_offer_columns() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_errand_offers_guard ON public.errand_offers;
CREATE TRIGGER trg_errand_offers_guard
  BEFORE UPDATE ON public.errand_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_errand_offer_columns();

-- ---------------------------------------------------------------------------
-- 4. Le back-office affichait des utilisateurs sans nom
--
-- Aucune politique n'autorisait un membre de l'équipe à lire les profils des
-- autres comptes : la liste des utilisateurs restait anonyme, donc inutilisable
-- pour attribuer un rôle en connaissance de cause.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff read profiles" ON public.profiles;
CREATE POLICY "Staff read profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );
