-- ---------------------------------------------------------------------------
-- Le troisième bouton d'arbitrage d'un litige menait à une erreur.
--
-- L'écran des litiges propose trois décisions : en faveur du shopper, en
-- faveur du client, ou annulation sans versement. La fonction n'en acceptait
-- que deux : le troisième bouton levait une exception, et le modérateur qui
-- l'employait recevait « Issue de litige inconnue ».
--
-- Cette troisième voie a pourtant un sens que les deux autres ne couvrent pas.
-- Donner raison au shopper le paie, donner raison au client le rembourse.
-- Annuler sans versement clôt le dossier sans transfert dans un sens ni dans
-- l'autre : la course n'a jamais eu lieu, ou les deux parties se sont
-- entendues autrement, et personne ne doit rien à personne.
--
-- Concrètement, elle rend au shopper ce qui avait été gelé, puisqu'aucune
-- faute ne lui est reprochée, et efface la commission due, puisque la
-- plateforme n'a pas de service à facturer sur une course annulée.
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
  v_errand     public.errands;
  v_rendu      numeric(12,2) := 0;
  v_commission numeric(12,2) := 0;
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

  -- Ce qui reste gelé pour cette course : le solde de ses ajustements, gels
  -- négatifs et restitutions positives confondus.
  SELECT COALESCE(-sum(amount), 0) INTO v_rendu
  FROM public.wallet_entries
  WHERE errand_id = p_errand_id AND kind = 'adjustment'::wallet_entry_kind;
  v_rendu := GREATEST(v_rendu, 0);

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

  ELSIF p_issue = 'client' THEN
    -- Les gains restent gelés : c'est la sanction du litige perdu.
    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'refunded'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

  ELSE
    -- Annulation sans versement : on remet chacun dans l'état d'avant.
    IF v_errand.runner_id IS NOT NULL THEN
      IF v_rendu > 0 THEN
        UPDATE public.runner_wallets
        SET available_balance = available_balance + v_rendu
        WHERE user_id = v_errand.runner_id;

        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind, v_rendu,
                'Litige clos sans versement, gel levé', now());
      END IF;

      -- La plateforme n'a pas de service à facturer sur une course annulée :
      -- la commission inscrite au débit du shopper est effacée par une
      -- écriture inverse, jamais par la modification de l'écriture d'origine.
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
    jsonb_build_object('issue', p_issue, 'rendu', v_rendu, 'commission_annulee', v_commission));

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_resolve_dispute(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_resolve_dispute(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.errand_resolve_dispute(uuid, text, text) IS
  'Trois issues : shopper (paie), client (rembourse), annulation (clot sans transfert ni dette).';
