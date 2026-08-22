-- ---------------------------------------------------------------------------
-- Un équivalent « à prix voisin » se compare au prix de l'article, pas au
-- budget entier de la course.
--
-- La consigne « Prendre un équivalent, à prix voisin » vaut accord d'avance,
-- tant que le prix reste voisin. L'écran de commande le dit au client : « Un
-- équivalent nettement plus cher vous sera quand même soumis. »
--
-- Le contrôle comparait pourtant le prix du remplacement au budget de la
-- course entière, majoré de la tolérance. Le cas, tel qu'il se produit :
-- budget de vingt-cinq mille francs, tolérance de quinze pour cent, un paquet
-- de riz à quatre mille francs introuvable. Le shopper propose un
-- remplacement à vingt mille. Le test retenait vingt mille contre vingt-huit
-- mille sept cent cinquante : accepté d'office, daté, et la notification au
-- client supprimée puisqu'elle n'est émise que lorsque son accord est attendu.
-- Le client paie cinq fois le prix de l'article sans avoir été consulté, et
-- l'apprend sur sa facture.
--
-- La référence devient la part du budget par article. Les articles ne portent
-- pas de prix unitaire : le client donne un libellé et une quantité, rien de
-- plus. La moyenne est donc la seule référence disponible, et elle suffit à
-- rendre la promesse vraie.
--
-- Le sens du doute est renversé au passage : sans budget, ou sans article,
-- plus rien n'est accepté d'office. Demander coûte une notification, accepter
-- à tort coûte de l'argent au client.
--
-- La variable v_reference était affectée puis jamais relue. Elle sert enfin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_item_report(
  p_item_id uuid,
  p_state text,
  p_label text DEFAULT NULL::text,
  p_price numeric DEFAULT NULL::numeric,
  p_note text DEFAULT NULL::text
)
RETURNS public.errand_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_item      public.errand_items;
  v_errand    public.errands;
  v_auto      boolean := false;
  v_reference numeric(12,2);
  v_articles  integer;
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
    -- tant que le prix reste voisin de CELUI DE L'ARTICLE. Au delà, il reprend
    -- la main, car accepter un équivalent n'est pas accepter un prix.
    IF v_errand.substitution_policy = 'similar'::substitution_policy THEN
      SELECT count(*) INTO v_articles
      FROM public.errand_items WHERE errand_id = v_errand.id;

      -- Part du budget revenant à un article. Les articles ne portent pas de
      -- prix unitaire, la moyenne est la seule référence disponible.
      v_reference := CASE
        WHEN COALESCE(v_articles, 0) > 0 AND COALESCE(v_errand.budget_estimate, 0) > 0
          THEN v_errand.budget_estimate / v_articles
        ELSE NULL
      END;

      -- Sans prix proposé, rien n'est engagé : l'accord d'avance tient.
      -- Sans référence, on demande : accepter à tort coûte de l'argent au
      -- client, demander ne coûte qu'une notification.
      v_auto := p_price IS NULL
        OR (v_reference IS NOT NULL
            AND p_price <= v_reference * (1 + v_errand.substitution_price_tolerance_pct / 100));
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
$fn$;

REVOKE ALL ON FUNCTION public.errand_item_report(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_item_report(uuid, text, text, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- La comparaison ne doit plus jamais porter sur le budget entier.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_source text := pg_get_functiondef('public.errand_item_report(uuid, text, text, numeric, text)'::regprocedure);
BEGIN
  IF v_source ~ 'p_price <= COALESCE\(v_errand\.budget_estimate' THEN
    RAISE EXCEPTION 'La tolérance compare de nouveau le prix au budget entier de la course.';
  END IF;

  IF v_source !~ 'v_reference \* \(1 \+' THEN
    RAISE EXCEPTION 'La tolérance ne s''appuie pas sur la référence par article.';
  END IF;
END
$$;
