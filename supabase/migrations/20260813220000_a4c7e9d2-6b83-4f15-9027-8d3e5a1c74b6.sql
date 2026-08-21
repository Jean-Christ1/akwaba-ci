-- ---------------------------------------------------------------------------
-- Corrections issues de l'audit final du 13 août 2026.
--
-- Sept défauts sont corrigés ici. Quatre laissaient sortir de l'argent, deux
-- rendaient l'application inutilisable dès l'application des migrations, un
-- privait le journal d'audit de toute valeur probante. Tous ont été constatés
-- par lecture du code, aucun n'est supposé.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le privilège de lecture colonne par colonne devient auto-adaptatif.
--
-- La liste figée posée précédemment n'a jamais été étendue aux dix-huit
-- colonnes ajoutées ensuite. L'écran de détail d'une course en sélectionne
-- quatre : le jour où les migrations passent, cet écran et le tableau de bord
-- du shopper tombent en 42501. Une liste écrite à la main se périme à la
-- migration suivante ; on la calcule donc, en excluant nommément ce qui doit
-- rester secret.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.refresh_errand_column_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum)
  INTO v_cols
  FROM pg_attribute
  WHERE attrelid = 'public.errands'::regclass
    AND attnum > 0
    AND NOT attisdropped
    -- Le code de remise est le seul secret de la table : le shopper ne doit
    -- pas pouvoir le lire, sinon la remise en main propre ne prouve plus rien.
    AND attname <> 'handover_code';

  EXECUTE 'REVOKE SELECT ON public.errands FROM authenticated';
  EXECUTE 'GRANT SELECT (' || v_cols || ') ON public.errands TO authenticated';
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_errand_column_grants() FROM PUBLIC, anon, authenticated;

SELECT public.refresh_errand_column_grants();

COMMENT ON FUNCTION public.refresh_errand_column_grants() IS
  'À rappeler après tout ajout de colonne sur errands, sinon la nouvelle colonne reste illisible.';

-- ---------------------------------------------------------------------------
-- 2. La maturation transférait le montant brut : la commission devenait
--    retirable par le shopper.
--
-- L'entrée « earning » porte le brut, l'entrée « commission » porte la retenue
-- en négatif, et le solde en attente n'a été augmenté que du net. La maturation
-- ne sommait que les « earning », donc elle versait au disponible plus que ce
-- qui avait été mis en attente : la différence est exactement la commission de
-- la plateforme. On somme désormais la course entière, retenue comprise.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.wallet_release_matured_earnings()
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_total numeric(12,2) := 0;
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
    RETURNING errand_id, amount
  )
  SELECT COALESCE(sum(m.amount + COALESCE(c.retenue, 0)), 0)
  INTO v_total
  FROM matured m
  LEFT JOIN LATERAL (
    -- La retenue est négative : l'addition donne le gain net du shopper.
    SELECT sum(w.amount) AS retenue
    FROM public.wallet_entries w
    WHERE w.errand_id = m.errand_id
      AND w.kind = 'commission'::wallet_entry_kind
  ) c ON m.errand_id IS NOT NULL;

  v_total := GREATEST(v_total, 0);

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
-- 3. Le dénouement d'un litige rendait la somme de tous les gels passés.
--
-- Un litige rouvert puis tranché deux fois recréditait deux fois. On somme
-- maintenant tous les ajustements de la course, gels et restitutions
-- confondus : le solde de ce compte est, par construction, ce qui reste gelé.
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
  v_rendu  numeric(12,2) := 0;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut trancher un litige.' USING ERRCODE = '42501';
  END IF;

  IF p_issue NOT IN ('shopper', 'client') THEN
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
    -- Solde des ajustements de cette course : les gels sont négatifs, les
    -- restitutions positives. Ce qui reste est ce qui est encore gelé.
    SELECT COALESCE(-sum(amount), 0) INTO v_rendu
    FROM public.wallet_entries
    WHERE errand_id = p_errand_id
      AND kind = 'adjustment'::wallet_entry_kind;

    v_rendu := GREATEST(v_rendu, 0);

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
  ELSE
    -- Tranché en faveur du client : les gains restent gelés, la course est close.
    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'refunded'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Litige tranché en faveur du ' || p_issue ||
    CASE WHEN p_note IS NOT NULL THEN ' : ' || left(trim(p_note), 400) ELSE '' END);

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_resolve_dispute(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Le pourboire était fixé par le shopper, sans plafond ni accord du client.
--
-- Un pourboire décidé par son bénéficiaire n'est pas un pourboire. Il devient
-- une décision du client, plafonnée, et la saisie de facture par le shopper ne
-- peut plus y toucher.
-- ---------------------------------------------------------------------------

ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS tip_cap numeric(12,2) NOT NULL DEFAULT 20000;

COMMENT ON COLUMN public.commission_rules.tip_cap IS
  'Plafond absolu du pourboire, garde-fou contre une saisie erronée ou un détournement.';

CREATE OR REPLACE FUNCTION public.errand_add_tip(
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
  v_rule   public.commission_rules;
  v_tip    numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client peut laisser un pourboire.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'La course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.current_commission_rule();
  v_tip := round(GREATEST(COALESCE(p_amount, 0), 0));

  IF v_tip > COALESCE(v_rule.tip_cap, 20000) THEN
    RAISE EXCEPTION 'Le pourboire dépasse le plafond autorisé.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    tip_amount    = v_tip,
    total_amount  = COALESCE(items_total, 0) + COALESCE(service_fee, 0)
                    + COALESCE(delivery_fee, 0) + COALESCE(overrun_fee, 0) + v_tip,
    runner_payout = GREATEST(COALESCE(service_fee, 0) + COALESCE(overrun_fee, 0)
                             - COALESCE(commission_amount, 0), 0) + v_tip,
    balance_due   = GREATEST(
                      COALESCE(items_total, 0) + COALESCE(service_fee, 0)
                      + COALESCE(delivery_fee, 0) + COALESCE(overrun_fee, 0) + v_tip
                      - COALESCE(advance_amount, 0), 0),
    updated_at    = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_add_tip(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_add_tip(uuid, numeric) TO authenticated;

-- La facture ne décide plus du pourboire : elle conserve celui que le client a
-- laissé. Le paramètre est gardé pour ne pas casser les appels existants, mais
-- il n'est plus lu. Un shopper qui l'envoie n'obtient rien.
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
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_commission numeric(12,2);
  v_total      numeric(12,2);
  v_depass     record;
  v_service    numeric(12,2);
  v_tolerance  numeric(12,2);
  v_ecart      boolean;
  v_tip        numeric(12,2);
BEGIN
  IF p_items_total < 0 OR p_delivery_fee < 0 THEN
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

  -- Le pourboire vient du client, jamais de la facture du shopper.
  v_tip := GREATEST(COALESCE(v_errand.tip_amount, 0), 0);

  v_tolerance := GREATEST(
    COALESCE(v_errand.budget_estimate, 0) * v_rule.budget_tolerance_pct / 100,
    v_rule.budget_tolerance_min
  );
  v_ecart := p_items_total > COALESCE(v_errand.budget_estimate, 0) + v_tolerance;

  SELECT * INTO v_depass FROM public.errand_compute_overrun(p_errand_id);

  v_service := COALESCE(v_errand.service_fee, 0) + COALESCE(v_depass.overrun_fee, 0);
  v_commission := round(v_service * v_rule.rate, 2);
  v_total := p_items_total + v_service + p_delivery_fee + v_tip;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    items_total       = p_items_total,
    delivery_fee      = p_delivery_fee,
    overtime_minutes  = COALESCE(v_depass.overtime_minutes, 0),
    extra_distance_km = COALESCE(v_depass.extra_distance_km, 0),
    overrun_fee       = COALESCE(v_depass.overrun_fee, 0),
    commission_rate   = v_rule.rate,
    commission_amount = v_commission,
    runner_payout     = v_service - v_commission + v_tip,
    total_amount      = v_total,
    balance_due       = GREATEST(v_total - COALESCE(v_errand.advance_amount, 0), 0),
    receipt_url       = COALESCE(p_receipt_url, receipt_url),
    budget_overrun_pending = (v_ecart AND budget_approved_at IS NULL)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(
    p_errand_id,
    v_errand.status,
    CASE
      WHEN v_ecart THEN 'Facture enregistrée, dépassement de budget en attente d''accord du client'
      WHEN COALESCE(v_depass.overrun_fee, 0) > 0
        THEN 'Facture enregistrée, dépassement de ' || v_depass.overtime_minutes || ' min'
      ELSE 'Facture enregistrée'
    END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Le déclencheur de garde ignorait les colonnes ajoutées après lui.
--
-- Le supplément facturé, l'accord du client sur un dépassement de budget, les
-- jalons de la mission et les paramètres du barème appliqué étaient écrivables
-- directement. Une garde écrite la veille désarmait une garde livrée le matin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Le moteur pose ce marqueur avant d'écrire : il est le seul à pouvoir le faire.
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status              IS DISTINCT FROM OLD.status
     OR NEW.payment_status      IS DISTINCT FROM OLD.payment_status
     OR NEW.runner_id           IS DISTINCT FROM OLD.runner_id
     OR NEW.customer_id         IS DISTINCT FROM OLD.customer_id
     OR NEW.items_total         IS DISTINCT FROM OLD.items_total
     OR NEW.service_fee         IS DISTINCT FROM OLD.service_fee
     OR NEW.delivery_fee        IS DISTINCT FROM OLD.delivery_fee
     OR NEW.commission_rate     IS DISTINCT FROM OLD.commission_rate
     OR NEW.commission_amount   IS DISTINCT FROM OLD.commission_amount
     OR NEW.total_amount        IS DISTINCT FROM OLD.total_amount
     OR NEW.runner_payout       IS DISTINCT FROM OLD.runner_payout
     OR NEW.advance_amount      IS DISTINCT FROM OLD.advance_amount
     OR NEW.balance_due         IS DISTINCT FROM OLD.balance_due
     OR NEW.tip_amount          IS DISTINCT FROM OLD.tip_amount
     OR NEW.handover_code       IS DISTINCT FROM OLD.handover_code
     OR NEW.receipt_url         IS DISTINCT FROM OLD.receipt_url
     OR NEW.rating              IS DISTINCT FROM OLD.rating
     -- Colonnes de suivi et de dépassement, ajoutées après la garde initiale.
     OR NEW.actual_minutes      IS DISTINCT FROM OLD.actual_minutes
     OR NEW.actual_distance_km  IS DISTINCT FROM OLD.actual_distance_km
     OR NEW.overtime_minutes    IS DISTINCT FROM OLD.overtime_minutes
     OR NEW.extra_distance_km   IS DISTINCT FROM OLD.extra_distance_km
     OR NEW.overrun_fee         IS DISTINCT FROM OLD.overrun_fee
     OR NEW.overrun_approved_at IS DISTINCT FROM OLD.overrun_approved_at
     OR NEW.budget_overrun_pending IS DISTINCT FROM OLD.budget_overrun_pending
     OR NEW.budget_approved_at  IS DISTINCT FROM OLD.budget_approved_at
     -- Jalons : ils datent la mission et servent au calcul du dépassement.
     OR NEW.started_at          IS DISTINCT FROM OLD.started_at
     OR NEW.accepted_at         IS DISTINCT FROM OLD.accepted_at
     OR NEW.shopping_at         IS DISTINCT FROM OLD.shopping_at
     OR NEW.delivering_at       IS DISTINCT FROM OLD.delivering_at
     OR NEW.delivered_at        IS DISTINCT FROM OLD.delivered_at
     -- Barème appliqué à cette course : le modifier revient à refaire le prix.
     OR NEW.overtime_grace_minutes IS DISTINCT FROM OLD.overtime_grace_minutes
     OR NEW.overtime_per_minute IS DISTINCT FROM OLD.overtime_per_minute
     OR NEW.distance_grace_km   IS DISTINCT FROM OLD.distance_grace_km
     OR NEW.distance_per_km     IS DISTINCT FROM OLD.distance_per_km
     OR NEW.overrun_cap_ratio   IS DISTINCT FROM OLD.overrun_cap_ratio
     OR NEW.budget_tolerance_pct IS DISTINCT FROM OLD.budget_tolerance_pct
     OR NEW.budget_tolerance_min IS DISTINCT FROM OLD.budget_tolerance_min
  THEN
    RAISE EXCEPTION 'Les montants, le statut et l''affectation d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Le journal d'audit était forgeable par n'importe quel compte connecté.
--
-- Une trace que tout le monde peut écrire ne prouve rien. Elle est réservée au
-- personnel de la plateforme, seul concerné par les actions qu'elle consigne.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) FROM authenticated;

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action      text,
  p_entity      text,
  p_entity_id   text DEFAULT NULL,
  p_details     jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Le journal d''audit est réservé au personnel de la plateforme.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), left(p_action, 80), left(p_entity, 80), left(p_entity_id, 120), p_details);
END;
$$;

REVOKE ALL ON FUNCTION public.log_audit(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Rien n'empêchait un shopper de servir et de régler sa propre course.
--
-- Le même compte des deux côtés vide le contrôle de son sens : la remise en
-- main propre, le code, la notation et le litige ne reposent plus sur rien.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_offer_self()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
BEGIN
  SELECT customer_id INTO v_customer FROM public.errands WHERE id = NEW.errand_id;

  IF v_customer IS NOT NULL AND v_customer = NEW.runner_id THEN
    RAISE EXCEPTION 'Vous ne pouvez pas proposer vos services sur votre propre course.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_errand_offer_self ON public.errand_offers;
CREATE TRIGGER trg_errand_offer_self
  BEFORE INSERT ON public.errand_offers
  FOR EACH ROW EXECUTE FUNCTION public.guard_errand_offer_self();

-- ---------------------------------------------------------------------------
-- 8. Un établissement pouvait se publier lui-même et s'attribuer le premium.
--
-- La politique de modification portait un USING sans WITH CHECK, donc le
-- propriétaire d'une fiche pouvait réécrire n'importe laquelle de ses colonnes,
-- y compris son état de modération et son placement premium. La création ne
-- contraignait pas davantage ces deux colonnes. Autrement dit, la modération
-- était contournable et le produit vendu s'auto-attribuait.
--
-- La modération et le premium deviennent des décisions de la plateforme, comme
-- les montants d'une course : le propriétaire garde la main sur le contenu de
-- sa fiche, sur rien d'autre.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_place_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Une fiche naît en attente et sans placement payant, quoi qu'en dise
    -- l'appelant. La fonction edge d'inscription, qui utilise la clé de
    -- service, n'est pas concernée par ce déclencheur.
    NEW.status  := 'pending'::place_status;
    NEW.premium := false;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'La publication d''une fiche est décidée par la modération.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.premium IS DISTINCT FROM OLD.premium THEN
    RAISE EXCEPTION 'Le placement premium est attribué par la plateforme.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Le propriétaire d''une fiche ne peut pas être changé ici.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_place_privileged_columns ON public.places;
CREATE TRIGGER trg_place_privileged_columns
  BEFORE INSERT OR UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.guard_place_privileged_columns();

-- La politique de modification portait un USING sans WITH CHECK : on rétablit
-- la symétrie, pour qu'une fiche ne puisse pas être réaffectée en la modifiant.
DROP POLICY IF EXISTS "Owners and admins can update places" ON public.places;
CREATE POLICY "Owners and admins can update places"
  ON public.places FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  )
  WITH CHECK (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );
