-- Corrections des défauts introduits par la remédiation
--
-- Une vérification adversariale a montré que plusieurs gardes posées pour
-- protéger les données bloquaient en réalité le moteur lui-même, et qu'une
-- condition mal écrite ouvrait l'annulation à n'importe qui. Ces défauts sont
-- corrigés ici, sans revenir sur les protections.

-- ---------------------------------------------------------------------------
-- 1. Le garde de runner_profiles empêchait la clôture d'une course
--
-- errand_confirm_payment incrémente jobs_completed et errand_rate_runner
-- recalcule la note. Ces deux écritures viennent du moteur, mais l'acteur
-- courant est le client : le garde les rejetait donc, ce qui rendait
-- impossibles la clôture et la notation, c'est-à-dire toute la fin du parcours.
--
-- Le garde reconnaît désormais le moteur, exactement comme celui de errands.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_runner_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Appels serveur, et écritures faites par les fonctions du moteur, qui ont
  -- déjà vérifié l'acteur et la transition avant d'en arriver là.
  IF auth.uid() IS NULL OR current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Le statut d''un profil shopper ne peut être modifié que par un modérateur.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'La note d''un shopper est calculée par la plateforme et ne peut pas être modifiée manuellement.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed THEN
    RAISE EXCEPTION 'Le nombre de missions est calculé par la plateforme et ne peut pas être modifié manuellement.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Le propriétaire d''un profil shopper ne peut pas être transféré.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Même correction sur le garde des comptes de retrait, pour la même raison.
CREATE OR REPLACE FUNCTION public.guard_payout_account_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR current_setting('app.errand_engine', true) = 'on'
     OR public.has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Un compte de retrait ne peut pas changer de propriétaire.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. errand_cancel laissait passer n'importe quel utilisateur connecté
--
-- Lorsque runner_id est nul, la comparaison v_errand.runner_id = auth.uid()
-- vaut NULL, et non faux. La condition de refus devenait alors indéterminée,
-- donc le IF ne se déclenchait pas : un tiers pouvait annuler une course
-- ouverte qui ne le concernait en rien.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_cancel(
  p_errand_id uuid,
  p_reason    text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand      public.errands;
  v_is_customer boolean;
  v_is_runner   boolean;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- COALESCE : une comparaison avec un identifiant nul ne doit jamais valoir
  -- autre chose que faux.
  v_is_customer := COALESCE(v_errand.customer_id = auth.uid(), false);
  v_is_runner   := COALESCE(v_errand.runner_id = auth.uid(), false);

  IF NOT (v_is_customer OR v_is_runner
          OR public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
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

  UPDATE public.errands SET status = 'cancelled'::errand_status
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, 'cancelled'::errand_status,
    COALESCE(NULLIF(p_reason, ''), 'Course annulée'));

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_cancel(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_cancel(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le code de remise ne doit jamais partir vers le shopper
--
-- La table accordait SELECT sur toutes ses colonnes, si bien qu'une lecture
-- large de la course livrait le code au shopper assigné. Il pouvait alors
-- valider lui-même la remise sans jamais rencontrer le client, ce qui vidait
-- de sa substance la seule preuve conditionnant le crédit du portefeuille.
--
-- Le privilège de lecture est donc accordé colonne par colonne, en excluant le
-- code. Le client continue de l'obtenir par errand_handover_code, qui vérifie
-- explicitement qu'il est bien le client.
-- ---------------------------------------------------------------------------

REVOKE SELECT ON public.errands FROM authenticated;

GRANT SELECT (
  id, customer_id, runner_id, title, category, city, zone, delivery_address,
  lat, lng, items, notes, budget_estimate, preferred_contact, scheduled_for,
  status, items_total, service_fee, delivery_fee, commission_rate,
  commission_amount, total_amount, payment_method, payment_status, receipt_url,
  rating, review, created_at, updated_at, fund_mode, advance_amount,
  advance_proof_url, advance_confirmed_at, balance_due, dropoff_mode,
  third_party_contact, vehicle_required, volume_size, urgency, distance_km,
  estimated_minutes, actual_minutes, started_at, runner_payout, tip_amount
) ON public.errands TO authenticated;

-- Les écritures restent gouvernées par les politiques et le déclencheur de garde.
GRANT INSERT, UPDATE ON public.errands TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Les favoris ne pouvaient pas être synchronisés
--
-- Le front emploie un upsert, ce qui exige le privilège UPDATE même sans
-- conflit réel. Il n'était pas accordé, et aucune politique ne couvrait cette
-- commande : chaque synchronisation échouait en silence.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Own favorites update" ON public.user_favorites;
CREATE POLICY "Own favorites update"
  ON public.user_favorites FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT UPDATE ON public.user_favorites TO authenticated;
