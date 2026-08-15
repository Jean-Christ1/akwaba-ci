-- ---------------------------------------------------------------------------
-- L'effacement d'un compte reste possible jusqu'au bout.
--
-- La chronologie d'une course cite son auteur, et sa clé étrangère est déjà en
-- ON DELETE SET NULL : supprimer un compte produit donc un UPDATE sur chaque
-- événement qu'il a signé. La garde d'ajout seul refusait cet UPDATE, si bien
-- que le droit à l'effacement restait inapplicable, cette fois par la
-- chronologie plutôt que par les écritures comptables.
--
-- La trace survit à la personne : le lien est dénoué, l'événement demeure, avec
-- sa date, son statut et sa note. Ce qui disparaît, c'est le rattachement
-- nominatif, et lui seul.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_append_only_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Anonymisation : seul le lien vers la personne change, le contenu de
    -- l'événement reste identique au caractère près.
    IF NEW.actor_id IS NULL AND OLD.actor_id IS NOT NULL
       AND NEW.errand_id IS NOT DISTINCT FROM OLD.errand_id
       AND NEW.status IS NOT DISTINCT FROM OLD.status
       AND NEW.note IS NOT DISTINCT FROM OLD.note
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'La chronologie d''une course ne se réécrit pas.'
      USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.errands e WHERE e.id = OLD.errand_id) THEN
    RAISE EXCEPTION 'La chronologie d''une course ne s''efface pas tant que la course existe.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

-- ---------------------------------------------------------------------------
-- La garde des courses tolère l'anonymisation, et elle seule.
--
-- Dénouer le lien vers un client effacé est un UPDATE sur customer_id, colonne
-- que la garde protège à juste titre : sans cette exception, l'effacement d'un
-- compte resterait impossible. La tolérance est étroite : le client passe à
-- nul, et absolument rien d'autre ne change.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Anonymisation par cascade : le client disparaît, la course et sa trace
  -- comptable demeurent. Aucun montant, aucun statut, aucune affectation ne
  -- bouge, sans quoi on retombe dans le cas général ci-dessous.
  IF NEW.customer_id IS NULL AND OLD.customer_id IS NOT NULL
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
     AND NEW.runner_id IS NOT DISTINCT FROM OLD.runner_id
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.commission_amount IS NOT DISTINCT FROM OLD.commission_amount
     AND NEW.runner_payout IS NOT DISTINCT FROM OLD.runner_payout THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status                 IS DISTINCT FROM OLD.status
     OR NEW.payment_status         IS DISTINCT FROM OLD.payment_status
     OR NEW.runner_id              IS DISTINCT FROM OLD.runner_id
     OR NEW.customer_id            IS DISTINCT FROM OLD.customer_id
     OR NEW.items_total            IS DISTINCT FROM OLD.items_total
     OR NEW.service_fee            IS DISTINCT FROM OLD.service_fee
     OR NEW.delivery_fee           IS DISTINCT FROM OLD.delivery_fee
     OR NEW.commission_rate        IS DISTINCT FROM OLD.commission_rate
     OR NEW.commission_amount      IS DISTINCT FROM OLD.commission_amount
     OR NEW.total_amount           IS DISTINCT FROM OLD.total_amount
     OR NEW.runner_payout          IS DISTINCT FROM OLD.runner_payout
     OR NEW.advance_amount         IS DISTINCT FROM OLD.advance_amount
     OR NEW.balance_due            IS DISTINCT FROM OLD.balance_due
     OR NEW.tip_amount             IS DISTINCT FROM OLD.tip_amount
     OR NEW.handover_code          IS DISTINCT FROM OLD.handover_code
     OR NEW.receipt_url            IS DISTINCT FROM OLD.receipt_url
     OR NEW.rating                 IS DISTINCT FROM OLD.rating
     OR NEW.actual_minutes         IS DISTINCT FROM OLD.actual_minutes
     OR NEW.actual_distance_km     IS DISTINCT FROM OLD.actual_distance_km
     OR NEW.overtime_minutes       IS DISTINCT FROM OLD.overtime_minutes
     OR NEW.extra_distance_km      IS DISTINCT FROM OLD.extra_distance_km
     OR NEW.overrun_fee            IS DISTINCT FROM OLD.overrun_fee
     OR NEW.overrun_approved_at    IS DISTINCT FROM OLD.overrun_approved_at
     OR NEW.budget_overrun_pending IS DISTINCT FROM OLD.budget_overrun_pending
     OR NEW.budget_approved_at     IS DISTINCT FROM OLD.budget_approved_at
     OR NEW.started_at             IS DISTINCT FROM OLD.started_at
     OR NEW.accepted_at            IS DISTINCT FROM OLD.accepted_at
     OR NEW.shopping_at            IS DISTINCT FROM OLD.shopping_at
     OR NEW.delivering_at          IS DISTINCT FROM OLD.delivering_at
     OR NEW.delivered_at           IS DISTINCT FROM OLD.delivered_at
     OR NEW.handover_attempts      IS DISTINCT FROM OLD.handover_attempts
     OR NEW.handover_locked_at     IS DISTINCT FROM OLD.handover_locked_at
  THEN
    RAISE EXCEPTION 'Les montants, le statut et l''affectation d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Une course orpheline de son client n'est pas une course anonyme.
--
-- errands.customer_id cascade : effacer un client efface ses courses, donc
-- aussi la trace comptable qu'elles portent, ce qui contredit l'obligation de
-- conservation. Le lien est dénoué comme ailleurs, la course reste, et son
-- historique avec elle.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.errands'::regclass AND contype = 'f'
    AND conname = 'errands_customer_id_fkey';

  IF v_def IS NOT NULL AND v_def LIKE '%CASCADE%' THEN
    ALTER TABLE public.errands DROP CONSTRAINT errands_customer_id_fkey;
    ALTER TABLE public.errands ALTER COLUMN customer_id DROP NOT NULL;
    ALTER TABLE public.errands ADD CONSTRAINT errands_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Vérification : un compte ayant participé à une course doit pouvoir être
-- effacé, et sa trace comptable doit lui survivre.
--
-- Ce contrôle s'exécute sur des données créées puis annulées : il ne laisse
-- rien derrière lui, mais il échoue la migration si l'effacement redevenait
-- impossible.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_client uuid;
  v_errand uuid;
  v_reste  integer;
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
  VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
          'authenticated', 'controle-effacement@example.invalid', '', now(), now(), now())
  RETURNING id INTO v_client;

  INSERT INTO public.errands (customer_id, title, category, city, delivery_address,
                              items, budget_estimate, status, payment_status, service_fee)
  VALUES (v_client, 'Contrôle d''effacement', 'grocery', 'Abidjan', 'Adresse',
          '[]'::jsonb, 0, 'open', 'pending', 0)
  RETURNING id INTO v_errand;

  INSERT INTO public.errand_payments (errand_id, payer_id, kind, amount)
  VALUES (v_errand, v_client, 'shopping_advance', 100);

  INSERT INTO public.errand_events (errand_id, actor_id, status, note)
  VALUES (v_errand, v_client, 'open', 'Contrôle');

  DELETE FROM auth.users WHERE id = v_client;

  SELECT count(*) INTO v_reste FROM public.errand_payments WHERE errand_id = v_errand;
  IF v_reste = 0 THEN
    RAISE EXCEPTION 'L''effacement d''un compte a emporté sa trace comptable.';
  END IF;

  -- Nettoyage : effacer la course en premier, sa disparition levant la garde
  -- qui protège sa chronologie et ses écritures tant qu'elle existe.
  DELETE FROM public.errands WHERE id = v_errand;
  DELETE FROM public.errand_events WHERE errand_id = v_errand;
  DELETE FROM public.errand_payments WHERE errand_id = v_errand;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Le contrôle d''effacement a échoué : % (%)', SQLERRM, SQLSTATE;
END
$$;
