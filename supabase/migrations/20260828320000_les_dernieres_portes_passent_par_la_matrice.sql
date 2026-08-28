-- Les cinq dernieres portes sensibles s'ouvrent enfin par la matrice.
--
-- Elles verifiaient un role herite, jamais le droit que la console affiche.
-- Quelqu'un a qui l'on confiait « Trancher un litige » lisait donc « accorde »
-- a l'ecran et se faisait refuser a l'usage, tandis qu'un ancien moderateur
-- tranchait sans que la matrice ait rien a en dire.
--
-- Les roles herites continuent d'ouvrir : le declencheur les recopie dans la
-- matrice, et l'acces de secours reste dans has_permission. Ce qui change,
-- c'est qu'ils passent par elle au lieu de la contourner.


CREATE OR REPLACE FUNCTION public.errand_resolve_dispute(p_errand_id uuid, p_issue text, p_note text DEFAULT NULL::text)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errand     public.errands;
  v_rendu      numeric(12,2) := 0;
  v_commission numeric(12,2) := 0;
  v_deja_paye  boolean;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  IF NOT public.has_permission(auth.uid(), 'litiges.trancher') THEN
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
$function$
;


CREATE OR REPLACE FUNCTION public.errand_unlock_handover(p_errand_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errand public.errands;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  IF NOT public.has_permission(auth.uid(), 'courses.deverrouiller') THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir une remise verrouillée.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    handover_attempts  = 0,
    handover_locked_at = NULL
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Le marqueur du moteur est propre à la transaction : celui qui l'arme le
  -- désarme, sinon il reste ouvert pour tout ce qui suit dans la même
  -- transaction.
  PERFORM set_config('app.errand_engine', 'off', true);

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Remise rouverte par la modération' ||
    CASE WHEN p_reason IS NOT NULL THEN ' : ' || left(trim(p_reason), 300) ELSE '' END);

  PERFORM public.log_audit('unlock', 'errand_handover', p_errand_id::text,
    jsonb_build_object('motif', COALESCE(NULLIF(trim(p_reason), ''), 'non precise')));

  RETURN v_errand;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.commission_settlement_record(p_runner_id uuid, p_amount numeric, p_reference text DEFAULT NULL::text)
 RETURNS runner_wallets
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_wallet public.runner_wallets;
  v_montant numeric(12,2);
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  IF NOT public.has_permission(auth.uid(), 'commissions.encaisser') THEN
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
$function$
;


CREATE OR REPLACE FUNCTION public.commission_rule_publish(p_rate numeric, p_min_service_fee numeric, p_min_payout numeric, p_hold_hours integer, p_overtime_grace integer, p_overtime_per_min numeric, p_distance_grace_km numeric, p_distance_per_km numeric, p_overrun_cap_ratio numeric, p_budget_tol_pct numeric, p_budget_tol_min numeric, p_settlement settlement_mode DEFAULT NULL::settlement_mode)
 RETURNS commission_rules
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_version integer;
  v_regle   public.commission_rules;
  v_ancien  public.commission_rules;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  IF NOT public.has_permission(auth.uid(), 'bareme.publier') THEN
    RAISE EXCEPTION 'Seul un administrateur peut publier un barème.' USING ERRCODE = '42501';
  END IF;

  IF p_rate < 0 OR p_rate > 0.5 THEN
    RAISE EXCEPTION 'Le taux de commission doit rester entre 0 et 50 pour cent.' USING ERRCODE = '22023';
  END IF;

  v_ancien := public.current_commission_rule();

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.commission_rules;

  UPDATE public.commission_rules SET is_active = false WHERE is_active = true;

  -- Les plafonds du pourboire et de la livraison, l'assiette de la commission
  -- et le mode de règlement sont repris du barème précédent : une console qui
  -- ne les expose pas encore ne doit pas les réinitialiser à son insu.
  INSERT INTO public.commission_rules (
    version, rate, base, settlement, min_service_fee, min_payout, hold_hours, is_active,
    overtime_grace_minutes, overtime_per_minute, distance_grace_km,
    distance_per_km, overrun_cap_ratio, budget_tolerance_pct, budget_tolerance_min,
    tip_cap, delivery_fee_cap
  ) VALUES (
    v_version, p_rate,
    COALESCE(v_ancien.base, 'service_and_delivery'),
    COALESCE(p_settlement, v_ancien.settlement, 'direct'::settlement_mode),
    p_min_service_fee, p_min_payout,
    p_hold_hours, true,
    p_overtime_grace, p_overtime_per_min, p_distance_grace_km,
    p_distance_per_km, p_overrun_cap_ratio, p_budget_tol_pct, p_budget_tol_min,
    COALESCE(v_ancien.tip_cap, 20000), COALESCE(v_ancien.delivery_fee_cap, 5000)
  )
  RETURNING * INTO v_regle;

  PERFORM public.log_audit('publish', 'commission_rule', v_version::text,
    jsonb_build_object('rate', p_rate, 'min_payout', p_min_payout,
                       'settlement', v_regle.settlement, 'base', v_regle.base));

  RETURN v_regle;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.runner_identity_reopen(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS runner_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profil public.runner_profiles;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  IF NOT public.has_permission(auth.uid(), 'shoppers.valider') THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir un dossier d''identité.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.runner_profiles SET
    status = 'pending'::runner_status
  WHERE user_id = p_user_id
  RETURNING * INTO v_profil;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit('reopen', 'runner_identity', p_user_id::text,
    jsonb_build_object('motif', left(COALESCE(trim(p_reason), ''), 300)));

  RETURN v_profil;
END;
$function$
;
