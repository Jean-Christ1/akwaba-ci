-- ---------------------------------------------------------------------------
-- Les substitutions d'articles deviennent des décisions tracées.
--
-- Une course d'achats se heurte tous les jours à la même situation : l'article
-- demandé est absent du rayon, ou son prix a doublé depuis la dernière fois.
-- Jusqu'ici, cet échange se réglait dans la conversation, et rien n'en restait :
-- le client découvrait le remplacement sur la facture, sans pouvoir démontrer
-- qu'il avait demandé autre chose, et le shopper sans pouvoir démontrer qu'il
-- avait prévenu.
--
-- C'est précisément le genre de désaccord qui finit en litige, et un litige
-- sans trace se tranche à pile ou face.
--
-- La liste d'articles reste dans errands.items, qui sert à la publication et au
-- devis. Cette table lui ajoute ce que le JSON ne sait pas porter : un état par
-- article, un remplacement proposé, et l'accord ou le refus du client, chacun
-- horodaté.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'errand_item_state') THEN
    CREATE TYPE public.errand_item_state AS ENUM (
      'requested',    -- tel que le client l'a demandé
      'found',        -- trouvé conforme
      'substitute',   -- remplacement proposé par le shopper
      'accepted',     -- remplacement accepté par le client
      'refused',      -- remplacement refusé par le client
      'unavailable'   -- introuvable, et le client le sait
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.errand_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id      uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  position       integer NOT NULL DEFAULT 0,
  label          text NOT NULL,
  qty            text,
  state          errand_item_state NOT NULL DEFAULT 'requested',
  -- Ce que le shopper propose à la place, et ce que ça coûte.
  substitute_label text,
  substitute_price numeric(12,2),
  substitute_note  text,
  proposed_at    timestamptz,
  decided_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT errand_items_label_len CHECK (char_length(trim(label)) BETWEEN 1 AND 160),
  CONSTRAINT errand_items_substitute_price CHECK (substitute_price IS NULL OR substitute_price >= 0),
  -- Un remplacement sans intitulé n'en est pas un : le client doit savoir ce
  -- qu'on lui propose avant d'accepter.
  CONSTRAINT errand_items_substitute_needs_label CHECK (
    state <> 'substitute'::errand_item_state
    OR (substitute_label IS NOT NULL AND char_length(trim(substitute_label)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS errand_items_errand ON public.errand_items (errand_id, position);

ALTER TABLE public.errand_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.errand_items FROM anon, authenticated;
GRANT SELECT ON public.errand_items TO authenticated;

DROP POLICY IF EXISTS "Participants read items" ON public.errand_items;
CREATE POLICY "Participants read items"
  ON public.errand_items FOR SELECT
  TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- Les états sont posés par les fonctions du moteur, jamais écrits directement :
-- un shopper pourrait sinon marquer « accepté » un remplacement que le client
-- n'a jamais vu.
CREATE OR REPLACE FUNCTION public.guard_errand_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'L''état d''un article est géré par la plateforme.' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_errand_items_guard ON public.errand_items;
CREATE TRIGGER trg_errand_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.errand_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_errand_items();

-- ---------------------------------------------------------------------------
-- La liste détaillée naît avec la course.
--
-- Elle est dérivée de errands.items, qui reste la source à la publication : on
-- ne demande pas deux fois la même chose au client.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_items_seed(p_errand_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_items jsonb;
  v_n     integer := 0;
BEGIN
  SELECT items INTO v_items FROM public.errands WHERE id = p_errand_id;
  IF v_items IS NULL OR jsonb_typeof(v_items) <> 'array' THEN
    RETURN 0;
  END IF;

  IF EXISTS (SELECT 1 FROM public.errand_items WHERE errand_id = p_errand_id) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  INSERT INTO public.errand_items (errand_id, position, label, qty)
  SELECT p_errand_id,
         (ordinalite - 1)::int,
         left(COALESCE(element ->> 'label', 'Article'), 160),
         left(COALESCE(element ->> 'qty', ''), 40)
  FROM jsonb_array_elements(v_items) WITH ORDINALITY AS t(element, ordinalite)
  WHERE COALESCE(trim(element ->> 'label'), '') <> '';

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_items_seed(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_errand_items_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.errand_items_seed(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_errands_seed_items ON public.errands;
CREATE TRIGGER trg_errands_seed_items
  AFTER INSERT ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.trg_errand_items_seed();

-- ---------------------------------------------------------------------------
-- Le shopper signale ce qu'il a trouvé, ou ce qu'il propose à la place.
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
  v_item   public.errand_items;
  v_errand public.errands;
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

  IF p_state = 'substitute' AND COALESCE(trim(p_label), '') = '' THEN
    RAISE EXCEPTION 'Indiquez ce que vous proposez à la place.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errand_items SET
    state            = p_state::errand_item_state,
    substitute_label = CASE WHEN p_state = 'substitute' THEN left(trim(p_label), 160) ELSE NULL END,
    substitute_price = CASE WHEN p_state = 'substitute' THEN GREATEST(COALESCE(p_price, 0), 0) ELSE NULL END,
    substitute_note  = CASE WHEN p_state = 'substitute' THEN left(trim(p_note), 300) ELSE NULL END,
    proposed_at      = CASE WHEN p_state = 'substitute' THEN now() ELSE NULL END,
    decided_at       = NULL,
    updated_at       = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  IF p_state = 'substitute' THEN
    PERFORM public.notify_enqueue(
      v_errand.customer_id, v_errand.id, 'item_substitute_' || left(p_item_id::text, 8),
      'Un remplacement vous est proposé',
      'Pour votre course "' || left(v_errand.title, 60) || '", "' || v_item.label
        || '" est indisponible. Le shopper propose "' || v_item.substitute_label
        || '". Votre accord est attendu.'
    );
  END IF;

  PERFORM public.log_errand_event(v_errand.id, v_errand.status,
    CASE p_state
      WHEN 'found' THEN 'Article trouvé : ' || left(v_item.label, 60)
      WHEN 'unavailable' THEN 'Article introuvable : ' || left(v_item.label, 60)
      ELSE 'Remplacement proposé : ' || left(v_item.label, 40) || ' par ' || left(COALESCE(v_item.substitute_label, ''), 40)
    END);

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_item_report(uuid, text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_item_report(uuid, text, text, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Le client accepte ou refuse le remplacement.
--
-- Sa décision est horodatée : c'est elle qui départage, le jour où l'un des
-- deux affirme le contraire.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_item_decide(
  p_item_id uuid,
  p_accept  boolean
)
RETURNS public.errand_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item   public.errand_items;
  v_errand public.errands;
BEGIN
  SELECT * INTO v_item FROM public.errand_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Article introuvable.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = v_item.errand_id;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client décide d''un remplacement.' USING ERRCODE = '42501';
  END IF;

  IF v_item.state <> 'substitute'::errand_item_state THEN
    RAISE EXCEPTION 'Aucun remplacement n''est en attente sur cet article.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errand_items SET
    state      = CASE WHEN p_accept THEN 'accepted'::errand_item_state ELSE 'refused'::errand_item_state END,
    decided_at = now(),
    updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;

  PERFORM public.notify_enqueue(
    v_errand.runner_id, v_errand.id, 'item_decided_' || left(p_item_id::text, 8),
    CASE WHEN p_accept THEN 'Remplacement accepté' ELSE 'Remplacement refusé' END,
    'Le client a ' || CASE WHEN p_accept THEN 'accepté' ELSE 'refusé' END
      || ' le remplacement de "' || v_item.label || '".'
  );

  PERFORM public.log_errand_event(v_errand.id, v_errand.status,
    'Remplacement ' || CASE WHEN p_accept THEN 'accepté' ELSE 'refusé' END
      || ' : ' || left(v_item.label, 60));

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_item_decide(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_item_decide(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Les courses déjà publiées reçoivent leur liste détaillée.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_errand record;
BEGIN
  FOR v_errand IN
    SELECT id FROM public.errands
    WHERE items IS NOT NULL AND jsonb_typeof(items) = 'array'
  LOOP
    PERFORM public.errand_items_seed(v_errand.id);
  END LOOP;
END
$$;
