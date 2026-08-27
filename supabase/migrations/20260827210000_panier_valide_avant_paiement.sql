-- Le client valide le panier avant que le shopper ne paie.
--
-- C'est le moment de vérité du service, et il n'existait pas.
--
-- Le problème, posé exactement. Trois façons de financer les achats, chacune
-- avec sa victime.
--
-- Si le client avance l'argent, le shopper peut disparaître avec. Si le shopper
-- avance le sien, deux choses arrivent : d'abord on exclut la population même
-- que le service vise, celle qui n'a pas de liquidité pour commencer ; ensuite,
-- à la livraison, le client peut refuser. En Côte d'Ivoire on ne rend pas la
-- marchandise : le shopper reste avec des produits payés dont personne ne veut.
-- Si la plateforme détient les fonds, c'est une activité financière réglementée
-- qu'aucun contrat ne couvre ici.
--
-- Le point commun des trois : à un instant donné, une seule partie est exposée
-- pendant que l'autre ne s'est engagée à rien. La solution n'est pas de choisir
-- qui prend le risque, c'est de supprimer cet instant.
--
-- D'où ce mécanisme. Avant de passer en caisse, le shopper soumet son panier :
-- le total réel et la photo du contenu ou de l'écran de caisse. Le client
-- valide ou refuse. À partir de la validation, les deux sont engagés : le
-- shopper sait qu'il ne paiera pas pour rien, le client ne peut plus découvrir
-- le montant après coup ni annuler. La validation est datée, attribuée, et le
-- modérateur la voit quand il tranche un litige.
--
-- Ce mécanisme ne demande aucun prestataire de paiement : il ne déplace pas
-- d'argent, il ordonne les engagements.

ALTER TABLE public.errands
  -- Ce que le shopper soumet avant de payer.
  ADD COLUMN IF NOT EXISTS basket_total        numeric(12,2)
    CHECK (basket_total IS NULL OR basket_total >= 0),
  ADD COLUMN IF NOT EXISTS basket_proof_url    text,
  ADD COLUMN IF NOT EXISTS basket_submitted_at timestamptz,
  -- La décision du client, et sa date. Le refus porte un motif : un shopper
  -- qui se voit refuser un panier doit savoir quoi corriger.
  ADD COLUMN IF NOT EXISTS basket_approved_at  timestamptz,
  ADD COLUMN IF NOT EXISTS basket_rejected_at  timestamptz,
  ADD COLUMN IF NOT EXISTS basket_note         text;

SELECT public.refresh_errand_column_grants();

-- ---------------------------------------------------------------------------
-- Le shopper soumet son panier
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_submit_basket(
  p_errand_id uuid,
  p_total     numeric,
  p_proof_url text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_errand public.errands;
  v_regle  public.commission_rules;
  v_plafond numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné peut soumettre le panier.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status <> 'shopping'::errand_status THEN
    RAISE EXCEPTION 'Le panier se soumet pendant les courses, avant de passer en caisse.'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_total, 0) <= 0 THEN
    RAISE EXCEPTION 'Indiquez le total réel du panier.' USING ERRCODE = '22023';
  END IF;

  -- Le depassement garde son plafond : un panier trois fois plus cher que le
  -- budget annonce n'est pas une variation, c'est un autre achat, et le client
  -- doit le decider par la procedure de depassement, pas par une validation
  -- rapide sur son telephone.
  v_regle := public.errand_commission_rule(p_errand_id);
  v_plafond := COALESCE(v_errand.budget_estimate, 0)
             * (1 + COALESCE(v_regle.budget_tolerance_pct, 0) / 100.0)
             + COALESCE(v_regle.budget_tolerance_min, 0);

  IF COALESCE(v_errand.budget_estimate, 0) > 0 AND p_total > v_plafond THEN
    RAISE EXCEPTION
      'Ce panier dépasse le budget annoncé de plus que la tolérance. Passez par la demande de dépassement.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    basket_total        = p_total,
    basket_proof_url    = NULLIF(btrim(COALESCE(p_proof_url, '')), ''),
    basket_submitted_at = now(),
    -- Une nouvelle soumission annule la decision precedente : le panier a
    -- change, l'accord porte sur l'ancien.
    basket_approved_at  = NULL,
    basket_rejected_at  = NULL,
    basket_note         = NULL
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM set_config('app.errand_engine', 'off', true);

  PERFORM public.notify_enqueue(
    v_errand.customer_id, p_errand_id, 'basket_submitted',
    'Votre panier attend votre accord',
    format('Le shopper a réuni votre commande pour %s FCFA. Validez avant qu''il ne passe en caisse.',
           trunc(p_total))
  );

  RETURN v_errand;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Le client tranche
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_decide_basket(
  p_errand_id uuid,
  p_accepte   boolean,
  p_note      text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut valider son panier.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.basket_submitted_at IS NULL THEN
    RAISE EXCEPTION 'Aucun panier n''a été soumis sur cette course.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.basket_approved_at IS NOT NULL THEN
    -- Revenir sur un accord apres que le shopper a paye sur sa foi serait
    -- exactement ce que ce mecanisme existe pour empecher.
    RAISE EXCEPTION 'Ce panier a déjà été validé : il ne peut plus être refusé.'
      USING ERRCODE = '22023';
  END IF;

  -- Refuser prive le shopper d'un achat qu'il s'appretait a faire : il doit
  -- savoir quoi corriger.
  IF NOT p_accepte AND char_length(btrim(COALESCE(p_note, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez ce qui ne va pas dans ce panier.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    basket_approved_at = CASE WHEN p_accepte THEN now() ELSE NULL END,
    basket_rejected_at = CASE WHEN p_accepte THEN NULL ELSE now() END,
    basket_note        = NULLIF(btrim(COALESCE(p_note, '')), '')
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM set_config('app.errand_engine', 'off', true);

  PERFORM public.log_errand_event(
    p_errand_id, v_errand.status,
    CASE WHEN p_accepte
         THEN format('Panier validé par le client : %s FCFA', trunc(COALESCE(v_errand.basket_total, 0)))
         ELSE format('Panier refusé par le client : %s', COALESCE(v_errand.basket_note, 'sans motif')) END
  );

  PERFORM public.notify_enqueue(
    v_errand.runner_id, p_errand_id,
    CASE WHEN p_accepte THEN 'basket_approved' ELSE 'basket_rejected' END,
    CASE WHEN p_accepte THEN 'Panier validé, vous pouvez payer' ELSE 'Panier refusé' END,
    CASE WHEN p_accepte
         THEN 'Le client a validé votre panier. Vous pouvez passer en caisse : son accord est enregistré et daté.'
         ELSE format('Le client a refusé le panier : %s', COALESCE(v_errand.basket_note, '')) END
  );

  RETURN v_errand;
END;
$fn$;

REVOKE ALL ON FUNCTION public.errand_submit_basket(uuid, numeric, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.errand_submit_basket(uuid, numeric, text) TO authenticated;
REVOKE ALL ON FUNCTION public.errand_decide_basket(uuid, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.errand_decide_basket(uuid, boolean, text) TO authenticated;
