-- ---------------------------------------------------------------------------
-- Le client décide à l'avance ce qu'il accepte comme remplacement.
--
-- Le shopper peut proposer un remplacement quand un article manque, et le
-- client accepte ou refuse. Mais cette décision arrive toujours en pleine
-- course, souvent alors que le client est occupé, et rien ne lui permettait de
-- la donner d'avance.
--
-- Or trois clients sur le même produit veulent trois choses différentes. Celui
-- qui commande un médicament précis ne veut aucun équivalent. Celui qui
-- commande du riz accepte n'importe quelle marque. Celui qui prépare un repas
-- veut être consulté. Sans cette consigne, le shopper devine, et se trompe.
--
-- La consigne est posée à la publication, et le moteur la fait respecter :
-- ce n'est pas une préférence d'affichage, c'est une règle opposable.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'substitution_policy') THEN
    CREATE TYPE public.substitution_policy AS ENUM (
      'never',    -- aucun remplacement : introuvable veut dire introuvable
      'ask',      -- le shopper propose, le client tranche article par article
      'similar'   -- équivalent accepté d'avance, dans la limite du prix convenu
    );
  END IF;
END
$$;

ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS substitution_policy substitution_policy NOT NULL DEFAULT 'ask',
  -- Au delà de cet écart, même en remplacement accepté d'avance, le client
  -- reprend la main : accepter un équivalent n'est pas accepter n'importe quel
  -- prix.
  ADD COLUMN IF NOT EXISTS substitution_price_tolerance_pct numeric(5,2) NOT NULL DEFAULT 15;

COMMENT ON COLUMN public.errands.substitution_policy IS
  'never : aucun remplacement. ask : le client tranche. similar : equivalent accepte d avance sous tolerance de prix.';

SELECT public.refresh_errand_column_grants();

-- ---------------------------------------------------------------------------
-- La publication accepte la consigne.
--
-- Le paramètre est ajouté en fin de signature avec une valeur par défaut : les
-- appels existants continuent de fonctionner sans modification, et retombent
-- sur la consigne la plus prudente, celle qui demande l'avis du client.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_set_substitution_policy(
  p_errand_id uuid,
  p_policy    text,
  p_tolerance numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client fixe la consigne de remplacement.' USING ERRCODE = '42501';
  END IF;

  IF p_policy NOT IN ('never', 'ask', 'similar') THEN
    RAISE EXCEPTION 'Consigne de remplacement inconnue.' USING ERRCODE = '22023';
  END IF;

  -- Une fois les achats commencés, changer la consigne reviendrait à
  -- désavouer après coup un shopper qui l'a suivie.
  IF v_errand.status NOT IN ('draft'::errand_status, 'open'::errand_status, 'assigned'::errand_status) THEN
    RAISE EXCEPTION 'La consigne ne se change plus une fois les achats commencés.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    substitution_policy = p_policy::substitution_policy,
    substitution_price_tolerance_pct = COALESCE(
      GREATEST(LEAST(p_tolerance, 100), 0), substitution_price_tolerance_pct),
    updated_at = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM set_config('app.errand_engine', 'off', true);

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_set_substitution_policy(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_set_substitution_policy(uuid, text, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Le moteur fait respecter la consigne.
--
-- Sans cela, la consigne ne serait qu'un texte affiché : le shopper pourrait
-- proposer un remplacement sur une course qui les refuse, et le client se
-- retrouverait à arbitrer ce qu'il avait justement exclu d'avance.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_item_report(
  p_item_id   uuid,
  p_state     text,
  p_label     text DEFAULT NULL,
  p_price     numeric DEFAULT NULL,
  p_note      text DEFAULT NULL
)
RETURNS public.errand_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item      public.errand_items;
  v_errand    public.errands;
  v_auto      boolean := false;
  v_reference numeric(12,2);
BEGIN
  SELECT * INTO v_item FROM public.errand_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = v_item.errand_id;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné renseigne les articles.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est réglée, sa liste ne change plus.' USING ERRCODE = '22023';
  END IF;

  IF p_state NOT IN ('found', 'substitute', 'unavailable') THEN
    RAISE EXCEPTION 'État d''article inconnu.' USING ERRCODE = '22023';
  END IF;

  IF p_state = 'substitute' THEN
    IF COALESCE(trim(p_label), '') = '' THEN
      RAISE EXCEPTION 'Indiquez ce que vous proposez à la place.' USING ERRCODE = '22023';
    END IF;

    -- Le client a exclu les remplacements : l'article est simplement
    -- introuvable, et le shopper ne peut pas contourner cette consigne.
    IF v_errand.substitution_policy = 'never'::substitution_policy THEN
      RAISE EXCEPTION 'Le client refuse les remplacements sur cette course. Marquez l''article introuvable.'
        USING ERRCODE = '22023';
    END IF;

    -- Équivalent accepté d'avance : la décision du client est déjà donnée,
    -- tant que le prix reste dans la tolérance qu'il a fixée. Au delà, il
    -- reprend la main, car accepter un équivalent n'est pas accepter un prix.
    IF v_errand.substitution_policy = 'similar'::substitution_policy THEN
      v_reference := NULLIF(v_item.substitute_price, 0);
      v_auto := p_price IS NULL
        OR COALESCE(v_errand.budget_estimate, 0) = 0
        OR p_price <= COALESCE(v_errand.budget_estimate, 0)
             * (1 + v_errand.substitution_price_tolerance_pct / 100);
    END IF;
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errand_items SET
    state            = CASE
      WHEN p_state = 'substitute' AND v_auto THEN 'accepted'::errand_item_state
      ELSE p_state::errand_item_state END,
    substitute_label = CASE WHEN p_state = 'substitute' THEN left(trim(p_label), 160) ELSE NULL END,
    substitute_price = CASE WHEN p_state = 'substitute' THEN GREATEST(COALESCE(p_price, 0), 0) ELSE NULL END,
    substitute_note  = CASE WHEN p_state = 'substitute' THEN left(trim(p_note), 300) ELSE NULL END,
    proposed_at      = CASE WHEN p_state = 'substitute' THEN now() ELSE NULL END,
    decided_at       = CASE WHEN p_state = 'substitute' AND v_auto THEN now() ELSE NULL END,
    updated_at       = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  PERFORM set_config('app.errand_engine', 'off', true);

  -- On ne dérange le client que lorsque sa décision est réellement attendue.
  IF p_state = 'substitute' AND NOT v_auto THEN
    PERFORM public.notify_enqueue(
      v_errand.customer_id, v_errand.id, 'item_substitute_' || left(p_item_id::text, 8),
      'Un remplacement vous est proposé',
      'Pour votre course "' || left(v_errand.title, 60) || '", "' || v_item.label
        || '" est indisponible. Le shopper propose "' || COALESCE(v_item.substitute_label, '')
        || '". Votre accord est attendu.'
    );
  END IF;

  PERFORM public.log_errand_event(v_errand.id, v_errand.status,
    CASE
      WHEN p_state = 'found' THEN 'Article trouvé : ' || left(v_item.label, 60)
      WHEN p_state = 'unavailable' THEN 'Article introuvable : ' || left(v_item.label, 60)
      WHEN v_auto THEN 'Remplacement accepté d''avance : ' || left(v_item.label, 40)
        || ' par ' || left(COALESCE(v_item.substitute_label, ''), 40)
      ELSE 'Remplacement proposé : ' || left(v_item.label, 40)
        || ' par ' || left(COALESCE(v_item.substitute_label, ''), 40)
    END);

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_item_report(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_item_report(uuid, text, text, numeric, text) TO authenticated;
