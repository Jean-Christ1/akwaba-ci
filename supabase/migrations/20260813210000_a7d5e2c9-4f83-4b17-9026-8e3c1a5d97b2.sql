-- Console d'exploitation : paramètres, moyens de paiement, journal d'audit
--
-- L'éditeur ne pouvait rien piloter sans livrer du code : ni changer le barème,
-- ni ouvrir une ville, ni activer un moyen de paiement. Et aucune action
-- d'exploitation ne laissait de trace, ce qui est intenable dès qu'on manipule
-- l'argent d'autrui.

-- ---------------------------------------------------------------------------
-- 1. Moyens de paiement
--
-- Les clés d'un agrégateur ne doivent jamais atteindre le navigateur. La table
-- ne conserve donc que la configuration publique et un état d'activation ; les
-- secrets vivent dans les secrets Supabase, et cette table indique seulement
-- quel nom de secret utiliser.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_providers (
  code            text PRIMARY KEY,
  label           text        NOT NULL,
  kind            momo_provider,
  is_enabled      boolean     NOT NULL DEFAULT false,
  /** Nom du secret Supabase qui porte la clé, jamais la clé elle-même. */
  secret_name     text,
  merchant_number text,
  merchant_name   text,
  instructions    text,
  fee_percent     numeric(5,2) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent <= 100),
  fee_fixed       numeric(12,2) NOT NULL DEFAULT 0 CHECK (fee_fixed >= 0),
  position        integer     NOT NULL DEFAULT 100,
  configured_at   timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_providers ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.payment_providers.secret_name IS
  'Nom du secret Supabase contenant la clé du prestataire. La clé elle-même n''est jamais stockée ici.';

INSERT INTO public.payment_providers (code, label, kind, merchant_number, instructions, position) VALUES
  ('wave',         'Wave',              'wave'::momo_provider,         NULL,
   'Transfert Wave vers le numéro marchand, puis dépôt de la capture.', 10),
  ('orange_money', 'Orange Money',      'orange_money'::momo_provider, NULL,
   'Composer le code USSD Orange Money, puis dépôt de la capture.', 20),
  ('mtn_momo',     'MTN MoMo',          'mtn_momo'::momo_provider,     NULL,
   'Transfert MTN MoMo vers le numéro marchand.', 30),
  ('moov_money',   'Moov Money',        'moov_money'::momo_provider,   NULL,
   'Transfert Moov Money vers le numéro marchand.', 40),
  ('cash',         'Espèces à la remise', NULL, NULL,
   'Le client règle en espèces au moment de la remise.', 50)
ON CONFLICT (code) DO NOTHING;

-- Le client doit savoir quels moyens sont ouverts, mais pas quels secrets
-- existent : une vue publique expose le strict nécessaire.
CREATE OR REPLACE VIEW public.payment_methods_public AS
  SELECT code, label, kind, merchant_number, merchant_name, instructions, position
  FROM public.payment_providers
  WHERE is_enabled = true;

GRANT SELECT ON public.payment_methods_public TO anon, authenticated;

DROP POLICY IF EXISTS "Admins manage payment providers" ON public.payment_providers;
CREATE POLICY "Admins manage payment providers"
  ON public.payment_providers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.payment_providers FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payment_providers TO authenticated;
GRANT ALL ON public.payment_providers TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Journal d'audit des actions d'exploitation
--
-- Toute action d'un membre de l'équipe qui touche l'argent, un rôle ou un
-- paramètre doit laisser une trace nominative et non modifiable.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  entity      text        NOT NULL,
  entity_id   text,
  details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity, entity_id);

DROP POLICY IF EXISTS "Staff read audit" ON public.audit_logs;
CREATE POLICY "Staff read audit"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- Personne n'écrit ni ne modifie directement : seule la fonction dédiée inscrit.
REVOKE ALL ON public.audit_logs FROM anon, authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;

CREATE OR REPLACE FUNCTION public.log_audit(
  p_action    text,
  p_entity    text,
  p_entity_id text DEFAULT NULL,
  p_details   jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), p_action, p_entity, p_entity_id, COALESCE(p_details, '{}'::jsonb));
$$;

REVOKE ALL ON FUNCTION public.log_audit(text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Pilotage du barème depuis la console
--
-- Changer un taux crée une nouvelle version et désactive la précédente : on
-- garde ainsi la trace du barème qui s'appliquait à chaque course passée.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commission_rule_publish(
  p_rate              numeric,
  p_min_service_fee   numeric,
  p_min_payout        numeric,
  p_hold_hours        integer,
  p_overtime_grace    integer,
  p_overtime_per_min  numeric,
  p_distance_grace_km numeric,
  p_distance_per_km   numeric,
  p_overrun_cap_ratio numeric,
  p_budget_tol_pct    numeric,
  p_budget_tol_min    numeric
)
RETURNS public.commission_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_regle   public.commission_rules;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Seul un administrateur peut publier un barème.' USING ERRCODE = '42501';
  END IF;

  IF p_rate < 0 OR p_rate > 0.5 THEN
    RAISE EXCEPTION 'Le taux de commission doit rester entre 0 et 50 pour cent.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.commission_rules;

  UPDATE public.commission_rules SET is_active = false WHERE is_active = true;

  INSERT INTO public.commission_rules (
    version, rate, base, min_service_fee, min_payout, hold_hours, is_active,
    overtime_grace_minutes, overtime_per_minute, distance_grace_km,
    distance_per_km, overrun_cap_ratio, budget_tolerance_pct, budget_tolerance_min
  ) VALUES (
    v_version, p_rate, 'service_fee', p_min_service_fee, p_min_payout, p_hold_hours, true,
    p_overtime_grace, p_overtime_per_min, p_distance_grace_km,
    p_distance_per_km, p_overrun_cap_ratio, p_budget_tol_pct, p_budget_tol_min
  )
  RETURNING * INTO v_regle;

  PERFORM public.log_audit('publish', 'commission_rule', v_version::text,
    jsonb_build_object('rate', p_rate, 'min_payout', p_min_payout));

  RETURN v_regle;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Indicateurs d'exploitation
--
-- Ce que l'éditeur doit voir chaque matin : le volume, l'argent, la qualité du
-- service et la justesse des estimations.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_dashboard(p_days integer DEFAULT 30)
RETURNS TABLE (
  courses_total        bigint,
  courses_completed    bigint,
  courses_cancelled    bigint,
  courses_disputed     bigint,
  courses_open         bigint,
  volume_achats        numeric,
  volume_service       numeric,
  commission_encaissee numeric,
  supplements          numeric,
  duree_moyenne_min    numeric,
  ecart_temps_moyen    numeric,
  ecart_distance_moyen numeric,
  shoppers_actifs      bigint,
  shoppers_en_attente  bigint,
  retraits_en_attente  bigint,
  montant_a_verser     numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_depuis timestamptz := now() - make_interval(days => GREATEST(p_days, 1));
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Accès réservé à l''équipe.' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'completed'::errand_status),
    count(*) FILTER (WHERE status = 'cancelled'::errand_status),
    count(*) FILTER (WHERE status = 'disputed'::errand_status),
    count(*) FILTER (WHERE status = 'open'::errand_status),
    COALESCE(sum(items_total) FILTER (WHERE status = 'completed'::errand_status), 0),
    COALESCE(sum(service_fee) FILTER (WHERE status = 'completed'::errand_status), 0),
    COALESCE(sum(commission_amount) FILTER (WHERE status = 'completed'::errand_status), 0),
    COALESCE(sum(overrun_fee) FILTER (WHERE status = 'completed'::errand_status), 0),
    ROUND(AVG(actual_minutes) FILTER (WHERE status = 'completed'::errand_status), 1),
    ROUND(AVG(
      CASE WHEN COALESCE(estimated_minutes, 0) > 0 AND actual_minutes IS NOT NULL
           THEN (actual_minutes::numeric / estimated_minutes - 1) * 100 END
    ), 1),
    ROUND(AVG(
      CASE WHEN COALESCE(distance_km, 0) > 0 AND actual_distance_km IS NOT NULL
           THEN (actual_distance_km / distance_km - 1) * 100 END
    ), 1)
  INTO
    courses_total, courses_completed, courses_cancelled, courses_disputed, courses_open,
    volume_achats, volume_service, commission_encaissee, supplements,
    duree_moyenne_min, ecart_temps_moyen, ecart_distance_moyen
  FROM public.errands
  WHERE created_at >= v_depuis;

  SELECT
    count(*) FILTER (WHERE status = 'approved'::runner_status),
    count(*) FILTER (WHERE status = 'pending'::runner_status)
  INTO shoppers_actifs, shoppers_en_attente
  FROM public.runner_profiles;

  SELECT
    count(*) FILTER (WHERE status IN ('requested'::payout_status, 'processing'::payout_status)),
    COALESCE(sum(amount) FILTER (WHERE status IN ('requested'::payout_status, 'processing'::payout_status)), 0)
  INTO retraits_en_attente, montant_a_verser
  FROM public.payout_requests;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_dashboard(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_dashboard(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Les actions sensibles laissent une trace
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

  PERFORM public.log_audit('settle', 'payout_request', p_request_id::text,
    jsonb_build_object('status', p_status, 'amount', v_request.amount, 'reference', p_reference));

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.payout_request_settle(uuid, payout_status, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payout_request_settle(uuid, payout_status, text, text) TO authenticated;
