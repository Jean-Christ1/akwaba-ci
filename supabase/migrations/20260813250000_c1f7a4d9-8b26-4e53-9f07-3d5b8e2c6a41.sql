-- ---------------------------------------------------------------------------
-- La garde des courses citait sept colonnes qui n'existent pas sur la table.
--
-- overtime_grace_minutes, overtime_per_minute, distance_grace_km,
-- distance_per_km, overrun_cap_ratio, budget_tolerance_pct et
-- budget_tolerance_min appartiennent à commission_rules, où elles décrivent le
-- barème. Elles avaient été reprises dans la garde d'errands par confusion de
-- lecture entre deux migrations voisines.
--
-- Conséquence constatée en exécutant un parcours réel : PL/pgSQL évalue les
-- champs de NEW à l'exécution, si bien que TOUTE modification d'une course par
-- un utilisateur ordinaire échouait avec 42703, "record new has no field". La
-- garde ne protégeait donc plus rien : elle bloquait tout, y compris les
-- écritures légitimes du client sur ses propres notes.
--
-- Le barème reste protégé là où il vit : commission_rules porte sa propre
-- politique, et sa publication passe par commission_rule_publish.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Le moteur pose ce marqueur avant d'écrire : il est le seul à pouvoir le faire.
  IF current_setting('app.errand_engine', true) = 'on' THEN
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
     -- Suivi réel et dépassements : ils déterminent le supplément facturé.
     OR NEW.actual_minutes         IS DISTINCT FROM OLD.actual_minutes
     OR NEW.actual_distance_km     IS DISTINCT FROM OLD.actual_distance_km
     OR NEW.overtime_minutes       IS DISTINCT FROM OLD.overtime_minutes
     OR NEW.extra_distance_km      IS DISTINCT FROM OLD.extra_distance_km
     OR NEW.overrun_fee            IS DISTINCT FROM OLD.overrun_fee
     OR NEW.overrun_approved_at    IS DISTINCT FROM OLD.overrun_approved_at
     OR NEW.budget_overrun_pending IS DISTINCT FROM OLD.budget_overrun_pending
     OR NEW.budget_approved_at     IS DISTINCT FROM OLD.budget_approved_at
     -- Jalons : ils datent la mission et servent au calcul du dépassement.
     OR NEW.started_at             IS DISTINCT FROM OLD.started_at
     OR NEW.accepted_at            IS DISTINCT FROM OLD.accepted_at
     OR NEW.shopping_at            IS DISTINCT FROM OLD.shopping_at
     OR NEW.delivering_at          IS DISTINCT FROM OLD.delivering_at
     OR NEW.delivered_at           IS DISTINCT FROM OLD.delivered_at
  THEN
    RAISE EXCEPTION 'Les montants, le statut et l''affectation d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Les colonnes de la garde sont vérifiées à la pose, et non à la première
-- écriture d'un utilisateur.
--
-- Ce contrôle transforme une panne silencieuse, découverte en production par un
-- client qui n'arrive plus à modifier sa course, en un échec de migration
-- immédiat et lisible.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_citees text[];
  v_absentes text[];
BEGIN
  SELECT array_agg(DISTINCT m[1])
  INTO v_citees
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace,
       regexp_matches(p.prosrc, 'NEW\.(\w+)', 'g') AS m
  WHERE n.nspname = 'public' AND p.proname = 'guard_errand_privileged_columns';

  SELECT array_agg(x)
  INTO v_absentes
  FROM unnest(v_citees) AS x
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.errands'::regclass
      AND a.attname = x AND a.attnum > 0 AND NOT a.attisdropped
  );

  IF v_absentes IS NOT NULL THEN
    RAISE EXCEPTION 'La garde cite des colonnes absentes de errands : %', array_to_string(v_absentes, ', ');
  END IF;
END
$$;
