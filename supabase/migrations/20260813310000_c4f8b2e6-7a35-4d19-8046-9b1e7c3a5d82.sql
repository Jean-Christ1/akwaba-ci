-- ---------------------------------------------------------------------------
-- Cinq défauts constatés en interrogeant la base après remédiation.
--
-- Chacun a été reproduit avant d'être corrigé, aucun n'est supposé.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. Le dépôt d'une preuve d'avance contournait la confirmation du shopper.
--
-- errand_declare_advance avait été refondue pour que le client déclare son
-- versement sans qu'il compte tant que le shopper ne l'a pas reconnu.
-- errand_attach_proof, écrite avant, était restée intacte et écrivait
-- directement advance_amount et advance_confirmed_at. Or c'est le chemin que
-- l'écran de dépôt de preuve emprunte : la protection était donc en place
-- partout sauf là où elle sert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_attach_proof(
  p_errand_id uuid,
  p_kind      text,
  p_path      text,
  p_amount    numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  IF p_kind NOT IN ('receipt', 'advance') THEN
    RAISE EXCEPTION 'Type de preuve inconnu.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(char_length(trim(p_path)), 0) = 0 THEN
    RAISE EXCEPTION 'Fichier de preuve manquant.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_errand_participant(p_errand_id, auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  IF p_kind = 'receipt' THEN
    IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
      RAISE EXCEPTION 'Seul le shopper assigné dépose le reçu des achats.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.errands SET receipt_url = p_path, updated_at = now()
    WHERE id = p_errand_id RETURNING * INTO v_errand;

  ELSE
    IF v_errand.customer_id <> auth.uid() THEN
      RAISE EXCEPTION 'Seul le client dépose la preuve de son avance.' USING ERRCODE = '42501';
    END IF;

    -- La preuve accompagne la déclaration, elle ne la remplace pas : le montant
    -- ne compte dans le reste à payer qu'une fois reconnu par le shopper.
    -- Écrire ici advance_amount reviendrait à laisser le débiteur décider seul
    -- de ce qu'il a versé, ce que la refonte de la déclaration avait justement
    -- corrigé ailleurs.
    UPDATE public.errands SET
      advance_proof_url       = p_path,
      advance_declared_amount = CASE
        WHEN p_amount IS NOT NULL THEN GREATEST(p_amount, 0)
        ELSE advance_declared_amount END,
      advance_declared_at     = CASE
        WHEN p_amount IS NOT NULL THEN now()
        ELSE advance_declared_at END,
      updated_at              = now()
    WHERE id = p_errand_id RETURNING * INTO v_errand;

    PERFORM public.log_errand_event(p_errand_id, v_errand.status,
      'Preuve d''avance déposée, en attente de confirmation du shopper');
  END IF;

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_attach_proof(uuid, text, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_attach_proof(uuid, text, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. La limitation des tentatives existait sans jamais servir.
--
-- errand_verify_handover_code compte les essais et bloque la remise au
-- cinquieme, ce qui est exactement ce qu'il faut. Mais aucun ecran ne
-- l'appelait : le seul chemin reel restait errand_advance_status, qui ne peut
-- pas compter puisque lever une exception annulerait son propre compteur.
--
-- La fonction n'est donc pas reecrite ici, elle est branchee cote ecran. Il
-- manquait seulement de quoi rouvrir une remise bloquee : sans cela, une
-- course legitime restait definitivement bloquee sur cinq fautes de frappe.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_unlock_handover(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir une remise.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);
  UPDATE public.errands SET handover_attempts = 0, handover_locked_at = NULL
  WHERE id = p_errand_id RETURNING * INTO v_errand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit('unlock', 'handover', p_errand_id::text, NULL);
  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_unlock_handover(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_unlock_handover(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le registre des paiements restait fabricable, et le devenait
--    définitivement puisque plus personne ne pouvait corriger.
--
-- INSERT était resté ouvert avec sa politique : les deux parties pouvaient
-- inscrire une écriture de leur choix, qu'aucun administrateur ne pouvait
-- ensuite rectifier à cause du déclencheur d'ajout seul. Le pire des deux
-- mondes. Les écritures naissent désormais des seules fonctions du moteur.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Participants create payments" ON public.errand_payments;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.errand_payments FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. Un compte ne pouvait plus être supprimé dès qu'il avait payé.
--
-- errand_payments.payer_id cascade à l'effacement du compte, et le déclencheur
-- d'ajout seul refusait cette suppression tant que la course existait. Le
-- droit à l'effacement devenait donc impossible à honorer, avec en prime un
-- message qui parlait de modification alors qu'il s'agissait d'une suppression.
--
-- La trace comptable doit survivre, la donnée personnelle non : le lien vers la
-- personne est dénoué, l'écriture reste. C'est ce que demandent à la fois la
-- comptabilité et le règlement.
-- ---------------------------------------------------------------------------

ALTER TABLE public.errand_payments
  DROP CONSTRAINT IF EXISTS errand_payments_payer_id_fkey;

ALTER TABLE public.errand_payments
  ADD CONSTRAINT errand_payments_payer_id_fkey
  FOREIGN KEY (payer_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.errand_payments
  ALTER COLUMN payer_id DROP NOT NULL;

COMMENT ON COLUMN public.errand_payments.payer_id IS
  'Nul quand le compte a été effacé : l''écriture comptable survit sans la donnée personnelle.';

CREATE OR REPLACE FUNCTION public.guard_append_only_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Le dénouement du lien vers une personne effacée n'est pas une réécriture
    -- de l'écriture : c'est ce qui permet à la trace de survivre sans elle.
    IF NEW.payer_id IS NULL AND OLD.payer_id IS NOT NULL
       AND NEW.amount IS NOT DISTINCT FROM OLD.amount
       AND NEW.errand_id IS NOT DISTINCT FROM OLD.errand_id THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Une écriture financière ne se modifie pas. Corrigez-la par une nouvelle écriture.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.errands e WHERE e.id = OLD.errand_id) THEN
    RAISE EXCEPTION 'Une écriture financière ne se supprime pas tant que sa course existe.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Un dépassement de budget non approuvé n'empêchait pas la clôture.
--
-- La course passait en attente d'accord du client, l'écran désactivait le
-- bouton, mais la fonction serveur ne regardait pas cet état. Une confirmation
-- appelée directement réglait donc une facture que le client n'avait pas
-- acceptée, ce qui vide de son sens tout le mécanisme d'approbation.
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

SELECT public.refresh_errand_column_grants();
