-- ---------------------------------------------------------------------------
-- Une course dont les achats sont faits ne s'annule plus d'un clic.
--
-- Le shopper accepte, part au marché, achète quarante mille francs de
-- marchandise, photographie le reçu et enregistre sa facture. Pendant qu'il
-- roule vers la remise, le client appuie sur « Annuler ».
--
-- L'annulation refuse aujourd'hui les courses terminées, déjà annulées, déjà
-- livrées ou déjà réglées. « En courses » et « en livraison » passent. La
-- course devient annulée, sans la moindre écriture au portefeuille ni au grand
-- livre. Le shopper a quarante mille francs de marchandise sur les bras et ne
-- peut plus rien faire : ouvrir un litige est explicitement refusé sur une
-- course annulée, et l'écran masque de toute façon les deux boutons.
--
-- Le client garde le droit d'annuler tant que rien n'a été acheté. Dès qu'il y
-- a un montant d'achats ou un reçu, la sortie est le litige, où un modérateur
-- tranche et où l'argent peut encore circuler.
--
-- Le désistement du shopper, qui remet la course au marché, n'est pas touché :
-- il ne fait perdre d'argent à personne. Le personnel non plus n'est pas
-- touché : annuler reste parfois la seule issue, et c'est son métier d'en
-- décider.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_cancel(p_errand_id uuid, p_reason text DEFAULT NULL::text)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_errand      public.errands;
  v_is_customer boolean;
  v_is_runner   boolean;
  v_personnel   boolean;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- COALESCE : une comparaison avec un identifiant nul ne doit jamais valoir
  -- autre chose que faux.
  v_is_customer := COALESCE(v_errand.customer_id = auth.uid(), false);
  v_is_runner   := COALESCE(v_errand.runner_id = auth.uid(), false);
  v_personnel   := public.has_role(auth.uid(), 'admin'::app_role)
                OR public.has_role(auth.uid(), 'moderator'::app_role);

  IF NOT (v_is_customer OR v_is_runner OR v_personnel) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status IN ('completed'::errand_status, 'cancelled'::errand_status) THEN
    RAISE EXCEPTION 'Cette course ne peut plus être annulée.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.status = 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course a été livrée : ouvrez un litige plutôt qu''une annulation.'
      USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Une course déjà réglée ne peut pas être annulée, ouvrez un litige.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  -- Le désistement du shopper : la course retourne au marché, personne ne perd
  -- d'argent. Ce chemin passe avant la garde qui suit, qui ne vise que le
  -- client.
  IF v_is_runner AND NOT v_is_customer
     AND v_errand.status IN ('assigned'::errand_status, 'shopping'::errand_status) THEN
    UPDATE public.errands SET
      runner_id = NULL,
      status    = 'open'::errand_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

    PERFORM public.log_errand_event(p_errand_id, 'open'::errand_status,
      COALESCE(NULLIF(p_reason, ''), 'Le shopper s''est désisté, la course est de nouveau ouverte'));
    RETURN v_errand;
  END IF;

  -- Le point ajouté : de l'argent a été engagé par le shopper. Annuler d'un clic
  -- le laisserait débiteur et sans recours, puisque le litige est refusé sur une
  -- course annulée.
  IF NOT v_personnel
     AND (COALESCE(v_errand.items_total, 0) > 0 OR v_errand.receipt_url IS NOT NULL) THEN
    RAISE EXCEPTION 'Le shopper a déjà engagé les achats : ouvrez un litige plutôt qu''une annulation.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.errands SET status = 'cancelled'::errand_status
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, 'cancelled'::errand_status,
    COALESCE(NULLIF(p_reason, ''), 'Course annulée'));

  RETURN v_errand;
END;
$function$;

REVOKE ALL ON FUNCTION public.errand_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_cancel(uuid, text) TO authenticated;
