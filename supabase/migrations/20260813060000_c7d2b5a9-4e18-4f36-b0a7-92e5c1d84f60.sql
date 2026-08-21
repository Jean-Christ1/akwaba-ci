-- Lot B : moteur de course cote serveur
--
-- Corrige la faille P0 confirmee en base : les politiques UPDATE de errands,
-- errand_offers et errand_payments n'avaient aucune garde de colonne, donc un
-- participant pouvait fixer librement les montants, la commission et
-- payment_status='paid', et cloturer une course sur simple clic client.
--
-- Principe retenu : le client ne pilote plus que le contenu editorial de sa
-- course. Tout ce qui touche a l'argent, au statut et a l'affectation passe par
-- des fonctions SECURITY DEFINER qui verifient l'acteur, verifient la
-- transition, et recalculent les montants a partir d'un bareme stocke.
--
-- Migration additive : aucune colonne, table ou fonctionnalite supprimee.

-- ---------------------------------------------------------------------------
-- 1. Bareme de commission versionne, source de verite unique
--
-- Remplace les trois valeurs contradictoires constatees dans le code
-- (0,15 dans pricing.ts, 0,10 dans domain.ts, 0,10 en defaut SQL).
-- La base commissionnable retenue est le frais de service seul : l'argent des
-- achats appartient au marchand et n'est jamais commissionne.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.commission_rules (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version          integer     NOT NULL UNIQUE,
  rate             numeric(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
  base             text        NOT NULL DEFAULT 'service_fee'
                                 CHECK (base IN ('service_fee', 'service_and_delivery')),
  min_service_fee  numeric(12,2) NOT NULL DEFAULT 1000 CHECK (min_service_fee >= 0),
  min_payout       numeric(12,2) NOT NULL DEFAULT 2000 CHECK (min_payout >= 0),
  hold_hours       integer     NOT NULL DEFAULT 24 CHECK (hold_hours >= 0),
  is_active        boolean     NOT NULL DEFAULT true,
  effective_from   timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

INSERT INTO public.commission_rules (version, rate, base, min_service_fee, min_payout, hold_hours)
VALUES (1, 0.1500, 'service_fee', 1000, 2000, 24)
ON CONFLICT (version) DO NOTHING;

DROP POLICY IF EXISTS "Commission rules readable" ON public.commission_rules;
CREATE POLICY "Commission rules readable"
  ON public.commission_rules FOR SELECT TO authenticated, anon
  USING (is_active = true);

REVOKE ALL ON public.commission_rules FROM anon, authenticated;
GRANT SELECT ON public.commission_rules TO anon, authenticated;
GRANT ALL ON public.commission_rules TO service_role;

CREATE OR REPLACE FUNCTION public.current_commission_rule()
RETURNS public.commission_rules
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.commission_rules
  WHERE is_active = true AND effective_from <= now()
  ORDER BY version DESC
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 2. Garde de colonnes sur errands
--
-- Les fonctions du moteur posent app.errand_engine='on' le temps de leur
-- transaction. Toute autre ecriture d'une colonne privilegiee est rejetee.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Appels serveur (service_role, migrations) et appels internes du moteur.
  IF auth.uid() IS NULL OR current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Les administrateurs conservent un droit de correction, trace par l'audit.
  IF public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status          IS DISTINCT FROM OLD.status
     OR NEW.payment_status  IS DISTINCT FROM OLD.payment_status
     OR NEW.runner_id       IS DISTINCT FROM OLD.runner_id
     OR NEW.customer_id     IS DISTINCT FROM OLD.customer_id
     OR NEW.items_total     IS DISTINCT FROM OLD.items_total
     OR NEW.service_fee     IS DISTINCT FROM OLD.service_fee
     OR NEW.delivery_fee    IS DISTINCT FROM OLD.delivery_fee
     OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.total_amount    IS DISTINCT FROM OLD.total_amount
     OR NEW.runner_payout   IS DISTINCT FROM OLD.runner_payout
     OR NEW.advance_amount  IS DISTINCT FROM OLD.advance_amount
     OR NEW.balance_due     IS DISTINCT FROM OLD.balance_due
     OR NEW.tip_amount      IS DISTINCT FROM OLD.tip_amount
     OR NEW.handover_code   IS DISTINCT FROM OLD.handover_code
     OR NEW.receipt_url     IS DISTINCT FROM OLD.receipt_url
     OR NEW.rating          IS DISTINCT FROM OLD.rating
  THEN
    RAISE EXCEPTION 'Les montants, le statut et l''affectation d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_errand_privileged_columns() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_errands_guard ON public.errands;
CREATE TRIGGER trg_errands_guard
  BEFORE UPDATE ON public.errands
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_errand_privileged_columns();

-- Une course ne peut plus etre creee avec des montants ou un statut arbitraires.
DROP POLICY IF EXISTS "Customer creates errand" ON public.errands;
CREATE POLICY "Customer creates errand"
  ON public.errands FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND char_length(title) >= 3 AND char_length(title) <= 160
    AND char_length(delivery_address) >= 3 AND char_length(delivery_address) <= 400
    AND status IN ('draft'::errand_status, 'open'::errand_status)
    AND payment_status = 'pending'::pay_status
    AND runner_id IS NULL
    AND items_total = 0
    AND commission_amount = 0
    AND runner_payout = 0
    AND tip_amount = 0
    AND balance_due = 0
    AND rating IS NULL
    AND budget_estimate >= 0
    AND service_fee >= 0
    AND delivery_fee >= 0
  );

-- ---------------------------------------------------------------------------
-- 3. Journal d'evenements : ecriture reservee au moteur
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_errand_event(
  p_errand_id uuid,
  p_status    errand_status,
  p_note      text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.errand_events (errand_id, actor_id, status, note)
  VALUES (p_errand_id, auth.uid(), p_status, p_note);
$$;

REVOKE ALL ON FUNCTION public.log_errand_event(uuid, errand_status, text) FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 4. Acceptation d'offre : recalcul integral des montants cote serveur
--
-- Corrige le defaut ou acceptOffer ecrivait service_fee sans recalculer
-- commission_amount, runner_payout ni total_amount.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_accept_offer(p_offer_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer   public.errand_offers;
  v_errand  public.errands;
  v_rule    public.commission_rules;
  v_commission numeric(12,2);
  v_base    numeric(12,2);
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
    started_at        = now()
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
-- 5. Progression de statut : transitions verifiees et reservees au bon acteur
-- ---------------------------------------------------------------------------

-- Le passage a "livree" exige le code de remise que le client communique au
-- shopper en main propre : c'est la preuve que la remise a bien eu lieu.
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

  UPDATE public.errands SET status = p_next WHERE id = p_errand_id RETURNING * INTO v_errand;
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

-- ---------------------------------------------------------------------------
-- 6. Facture reelle : le shopper declare les achats, le serveur recalcule
-- ---------------------------------------------------------------------------

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
  v_errand public.errands;
  v_rule   public.commission_rules;
  v_commission numeric(12,2);
  v_total  numeric(12,2);
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
  v_commission := round(v_errand.service_fee * v_rule.rate, 2);
  v_total := p_items_total + v_errand.service_fee + p_delivery_fee + p_tip_amount;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    items_total       = p_items_total,
    delivery_fee      = p_delivery_fee,
    tip_amount        = p_tip_amount,
    commission_rate   = v_rule.rate,
    commission_amount = v_commission,
    runner_payout     = v_errand.service_fee - v_commission + p_tip_amount,
    total_amount      = v_total,
    balance_due       = GREATEST(v_total - COALESCE(v_errand.advance_amount, 0), 0),
    receipt_url       = COALESCE(p_receipt_url, receipt_url)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status, 'Facture enregistrée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cloture : code de remise verifie, portefeuille credite, reputation mise a jour
--
-- C'est le coeur de la correction P0 : la cloture n'est plus declarative.
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

  -- Le code de remise a deja ete verifie au passage en "livree" par le shopper.
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

  -- Credit du portefeuille shopper. Les gains restent en attente le temps du
  -- delai anti-litige, puis basculent en solde disponible.
  IF v_errand.runner_id IS NOT NULL AND v_payout > 0 THEN
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label)
    VALUES (v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_payout,
            'Gain de la course ' || left(v_errand.title, 80));

    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label)
    VALUES (v_errand.runner_id, v_errand.id, 'commission'::wallet_entry_kind,
            -COALESCE(v_errand.commission_amount, 0),
            'Commission Akwaba');

    INSERT INTO public.runner_wallets (user_id) VALUES (v_errand.runner_id)
      ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.runner_wallets SET
      pending_balance   = pending_balance + v_payout,
      lifetime_earnings = lifetime_earnings + v_payout
    WHERE user_id = v_errand.runner_id;

    UPDATE public.runner_profiles SET
      jobs_completed = jobs_completed + 1
    WHERE user_id = v_errand.runner_id;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'completed'::errand_status, 'Course réglée et clôturée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_payment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Annulation et litige : les etats cancelled et disputed deviennent atteignables
-- ---------------------------------------------------------------------------

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

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Une course déjà réglée ne peut pas être annulée, ouvrez un litige.' USING ERRCODE = '22023';
  END IF;

  -- Passe l'affectation en cours : le shopper qui se desiste libere la course.
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
  v_errand public.errands;
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

  -- Les gains rattaches a la course sont geles tant que le litige n'est pas tranche.
  IF v_errand.runner_id IS NOT NULL THEN
    UPDATE public.runner_wallets SET
      pending_balance = GREATEST(pending_balance - GREATEST(COALESCE(v_errand.runner_payout, 0), 0), 0)
    WHERE user_id = v_errand.runner_id;

    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label)
    VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind,
            -GREATEST(COALESCE(v_errand.runner_payout, 0), 0),
            'Gains gelés, litige en cours');
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'disputed'::errand_status, left(trim(p_reason), 500));

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_open_dispute(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Notation du shopper apres cloture
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_rate_runner(
  p_errand_id uuid,
  p_rating    smallint,
  p_review    text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_avg    numeric(4,2);
BEGIN
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'La note doit être comprise entre 1 et 5.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut noter le shopper.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status <> 'completed'::errand_status THEN
    RAISE EXCEPTION 'La course doit être terminée avant d''être notée.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.rating IS NOT NULL THEN
    RAISE EXCEPTION 'Cette course a déjà été notée.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET rating = p_rating, review = NULLIF(left(trim(COALESCE(p_review, '')), 1000), '')
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF v_errand.runner_id IS NOT NULL THEN
    SELECT round(avg(rating)::numeric, 2) INTO v_avg
    FROM public.errands
    WHERE runner_id = v_errand.runner_id AND rating IS NOT NULL;

    UPDATE public.runner_profiles SET rating = COALESCE(v_avg, 0)
    WHERE user_id = v_errand.runner_id;
  END IF;

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_rate_runner(uuid, smallint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_rate_runner(uuid, smallint, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Le code de remise n'est lisible que par le client
--
-- Le shopper ne doit pas connaitre le code qu'il devra faire saisir : c'est
-- ce qui donne sa valeur a la preuve de remise.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_handover_code(p_errand_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND OR v_errand.customer_id <> auth.uid() THEN
    RETURN NULL;
  END IF;
  RETURN v_errand.handover_code;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_handover_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_handover_code(uuid) TO authenticated;
