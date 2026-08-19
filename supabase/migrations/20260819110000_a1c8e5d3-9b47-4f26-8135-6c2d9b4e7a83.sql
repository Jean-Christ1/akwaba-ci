-- ---------------------------------------------------------------------------
-- La garde des colonnes d'une course cesse d'énumérer ce qu'elle protège.
--
-- Elle citait cinquante colonnes nommées une par une. Une réécriture ultérieure
-- en a laissé tomber une, `handover_verified_at`, et personne ne l'a vu : rien
-- n'échoue quand une garde protège moins.
--
-- Ce que cet oubli permettait, très exactement : un shopper assigné, qui ne
-- connaît pas le code de remise, écrit lui-même `handover_verified_at` par une
-- requête directe. La politique de mise à jour l'y autorise, elle ne porte
-- aucune clause de vérification. Il appelle ensuite le passage en « livrée » :
-- le contrôle du code est sauté, puisqu'il ne s'applique que si la remise n'est
-- pas déjà vérifiée. La course est livrée, le journal inscrit « remise
-- confirmée par code », le client reçoit la notification et règle une course
-- qui ne lui a jamais été remise.
--
-- La correction ne consiste pas à rajouter la colonne manquante. Une liste de
-- ce qui est protégé s'ouvre à chaque colonne ajoutée et à chaque réécriture
-- distraite. La garde énumère désormais ce qu'un participant peut écrire
-- directement, et refuse tout le reste : une colonne nouvelle est protégée
-- d'office, une colonne oubliée est protégée aussi.
--
-- Aucun écran n'écrit dans cette table directement : tout passe par les
-- fonctions du moteur, qui arment le marqueur de session. La liste des colonnes
-- libres se réduit donc à l'horodatage de modification, posé par un
-- déclencheur.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Les seules colonnes qu'une écriture directe peut changer. Tout le reste
  -- appartient au moteur.
  v_libres  text[] := ARRAY['updated_at'];
  v_avant   jsonb;
  v_apres   jsonb;
  v_touchee text;
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

  v_avant := to_jsonb(OLD);
  v_apres := to_jsonb(NEW);

  SELECT cle
  INTO v_touchee
  FROM jsonb_object_keys(v_apres) AS cle
  WHERE NOT (cle = ANY (v_libres))
    AND v_apres -> cle IS DISTINCT FROM v_avant -> cle
  LIMIT 1;

  IF v_touchee IS NOT NULL THEN
    -- Le message nomme la colonne : un développeur qui heurte la garde doit
    -- savoir laquelle, sans avoir à deviner.
    RAISE EXCEPTION
      'Les montants, le statut, l''affectation et les preuves d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement (colonne « % »).',
      v_touchee
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_errand_privileged_columns() IS
  'Refuse toute écriture directe sur une course hors des colonnes libres. Fermée par défaut : une colonne ajoutée est protégée sans qu''on ait à y penser.';

-- ---------------------------------------------------------------------------
-- Le contrôle qui rendait l'oubli possible.
--
-- Le contrôle en place vérifiait que les colonnes citées par la garde existent.
-- Il ne pouvait donc rien dire d'une colonne que la garde ne citait plus. Le
-- nouveau contrôle vérifie l'inverse : que la garde ne laisse libre aucune
-- colonne sensible.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_source     text := pg_get_functiondef('public.guard_errand_privileged_columns()'::regprocedure);
  v_sensibles  text[] := ARRAY[
    'status', 'payment_status', 'runner_id', 'customer_id',
    'items_total', 'service_fee', 'delivery_fee', 'commission_rate',
    'commission_amount', 'total_amount', 'runner_payout', 'advance_amount',
    'balance_due', 'tip_amount', 'handover_code', 'handover_verified_at',
    'handover_attempts', 'handover_locked_at', 'receipt_url', 'rating',
    'advance_declared_amount', 'advance_confirmed_at', 'advance_proof_url',
    'budget_approved_at', 'budget_approved_amount', 'overrun_fee',
    'substitution_policy', 'commission_rule_id'
  ];
  v_col        text;
BEGIN
  -- La garde doit être fermée par défaut : sa liste de colonnes libres ne doit
  -- contenir aucune colonne sensible.
  FOREACH v_col IN ARRAY v_sensibles LOOP
    IF v_source ~ ('v_libres[^;]*''' || v_col || '''') THEN
      RAISE EXCEPTION 'La garde laisse libre une colonne sensible : %', v_col;
    END IF;
  END LOOP;

  IF v_source !~ 'jsonb_object_keys' THEN
    RAISE EXCEPTION 'La garde est revenue à une énumération : un oubli y redevient possible.';
  END IF;
END
$$;
