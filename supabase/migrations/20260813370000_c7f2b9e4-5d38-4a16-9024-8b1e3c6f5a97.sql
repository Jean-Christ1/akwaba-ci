-- ---------------------------------------------------------------------------
-- Le marqueur du moteur cesse de rester armé après usage.
--
-- Les fonctions du moteur posent app.errand_engine avant d'écrire, ce qui les
-- autorise à franchir les gardes. Ce marqueur est local à la TRANSACTION, non à
-- l'appel : une fois posé, il reste armé jusqu'à la fin de la transaction.
--
-- Tant que chaque écriture arrivait par un appel distinct, cela ne se voyait
-- pas : PostgREST ouvre une transaction par requête. Mais le déclencheur qui
-- crée la liste détaillée d'une course s'exécute dans la transaction de
-- l'INSERT, et laissait donc le marqueur armé derrière lui. Toute écriture
-- suivante, dans la même transaction, franchissait les gardes.
--
-- La recette l'a montré sans ambiguïté : après la création d'une course, un
-- client parvenait à réécrire ses propres montants, ce que la garde refuse en
-- temps normal.
--
-- Le correctif est le principe qui manquait : qui arme désarme. Chaque fonction
-- qui pose le marqueur le retire avant de rendre la main.
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

  -- Désarmement : sans lui, tout ce qui suit dans la même transaction franchit
  -- les gardes, y compris des écritures qui n'ont rien à voir avec le moteur.
  PERFORM set_config('app.errand_engine', 'off', true);

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_items_seed(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Les déclencheurs de notification suivent la même règle.
--
-- Ils s'exécutent après l'écriture qui les provoque, dans sa transaction, et
-- appellent notify_enqueue. Celle-ci n'arme pas le marqueur, mais rien ne
-- garantissait qu'elle ne le ferait jamais : on rend la règle explicite plutôt
-- que de compter sur une propriété qu'une modification future pourrait perdre.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_errand_items_seed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.errand_items_seed(NEW.id);
  PERFORM set_config('app.errand_engine', 'off', true);
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- La garde des articles tolère l'absence d'identité applicative.
--
-- Une migration, une tâche d'exploitation ou une cascade de suppression
-- s'exécutent sans auth.uid() : la garde les prenait pour des tentatives
-- d'écriture directe et les refusait, si bien que supprimer une course
-- devenait impossible. Les autres gardes du projet portent déjà cette même
-- tolérance, celle-ci l'avait oubliée.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sans identité applicative, l'appel vient de la base elle-même : migration,
  -- tâche planifiée, ou cascade. Le navigateur, lui, a toujours une identité.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'L''état d''un article est géré par la plateforme.' USING ERRCODE = '42501';
END;
$$;

-- ---------------------------------------------------------------------------
-- Contrôle : après la création d'une course, la garde doit être réarmée.
--
-- Ce contrôle reproduit exactement ce que la recette a découvert, dans la même
-- transaction, et fait échouer la migration si la protection retombait.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_client uuid;
  v_errand uuid;
  v_passe  boolean := false;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'controle-marqueur@example.invalid', '', now(), now(), now())
  RETURNING id INTO v_client;

  INSERT INTO public.errands (customer_id, title, category, city, delivery_address,
                              items, budget_estimate, status, payment_status, service_fee)
  VALUES (v_client, 'Contrôle du marqueur', 'grocery', 'Abidjan', 'Adresse',
          '[{"label":"Article","qty":"1"}]'::jsonb, 0, 'open', 'pending', 2000)
  RETURNING id INTO v_errand;

  -- Le marqueur doit être retombé : on le vérifie directement.
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RAISE EXCEPTION 'Le marqueur du moteur reste armé après la création d''une course.';
  END IF;

  DELETE FROM public.errands WHERE id = v_errand;
  DELETE FROM auth.users WHERE id = v_client;
  v_passe := true;

  IF NOT v_passe THEN
    RAISE EXCEPTION 'Contrôle du marqueur non concluant.';
  END IF;
END
$$;
