-- ---------------------------------------------------------------------------
-- Intégrité financière : neuf défauts relevés par un audit adverse
--
-- Le fil commun de ces défauts est toujours le même : une pièce du dossier
-- financier peut être écrite, réécrite ou décidée par la partie qu'elle engage.
-- Une piste comptable réécrite par le débiteur, une avance auto-déclarée, un
-- barème qui change en cours de mission, un frais fixé sans plafond par son
-- bénéficiaire : dans chacun de ces cas, ce que la base affirme ne prouve rien.
--
-- Migration additive : aucune colonne ni fonctionnalité supprimée.
-- ---------------------------------------------------------------------------

-- pgcrypto porte gen_random_bytes, seule source d'aléa non prédictible
-- disponible en base. random() est un générateur déterministe amorçable.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Nouvelles colonnes
--
-- Elles sont posées en premier pour que la garde de colonnes puisse les citer.
-- ---------------------------------------------------------------------------

ALTER TABLE public.errands
  -- Barème figé sur la course : sans lui, publier un nouveau barème re-tarife
  -- des missions déjà en cours, ce qu'aucun shopper n'a accepté.
  ADD COLUMN IF NOT EXISTS commission_rule_id uuid REFERENCES public.commission_rules(id),
  -- L'avance annoncée par le client, distincte de l'avance reconnue reçue par
  -- le shopper. Seule la seconde est déduite du reste à payer.
  ADD COLUMN IF NOT EXISTS advance_declared_amount numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_declared_at     timestamptz,
  -- Montant sur lequel a porté l'accord du client pour un dépassement de
  -- budget. Un accord sans montant ne vaut pour aucune facture.
  ADD COLUMN IF NOT EXISTS budget_approved_amount  numeric(12,2),
  -- Compteur de codes de remise erronés, et verrou de sécurité associé.
  ADD COLUMN IF NOT EXISTS handover_attempts       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handover_locked_at      timestamptz,
  ADD COLUMN IF NOT EXISTS handover_verified_at    timestamptz;

COMMENT ON COLUMN public.errands.commission_rule_id IS
  'Barème sous lequel la course a été publiée. Une course finit sous le barème sous lequel elle a commencé.';
COMMENT ON COLUMN public.errands.advance_declared_amount IS
  'Montant que le client dit avoir envoyé. Tant que le shopper ne l''a pas reconnu, il n''est pas déduit.';
COMMENT ON COLUMN public.errands.budget_approved_amount IS
  'Montant d''achats approuvé par le client. Toute facture supérieure invalide cet accord.';
COMMENT ON COLUMN public.errands.handover_attempts IS
  'Codes de remise erronés soumis depuis la dernière vérification réussie.';

ALTER TABLE public.commission_rules
  -- Sans plafond, le frais de livraison est une ligne libre sur la facture du
  -- client, décidée par celui qui l'encaisse.
  ADD COLUMN IF NOT EXISTS delivery_fee_cap numeric(12,2) NOT NULL DEFAULT 5000;

COMMENT ON COLUMN public.commission_rules.delivery_fee_cap IS
  'Plafond du frais de livraison saisi par le shopper, garde-fou contre une facturation libre.';

-- Le transport est une prestation du shopper au même titre que le service :
-- il entre donc dans l'assiette de la commission. Seul l'argent des achats,
-- qui appartient au marchand, en reste exclu. C'est ce que dit désormais la
-- colonne base, au lieu de laisser le frais de livraison hors de tout partage.
UPDATE public.commission_rules
SET base = 'service_and_delivery'
WHERE base = 'service_fee';

-- ---------------------------------------------------------------------------
-- 2. La piste comptable devient un registre en ajout seul
--
-- errand_payments était modifiable et supprimable par les deux parties d'une
-- course, et se remplissait d'un doublon à chaque déclaration répétée. Un
-- registre que ceux qu'il engage peuvent réécrire ne prouve rien : ni au
-- shopper qu'il a reçu, ni au client qu'il a payé, ni à un arbitre que l'un
-- des deux ment.
-- ---------------------------------------------------------------------------

-- Nettoyage préalable des lignes strictement identiques, sans lequel l'index
-- d'unicité ne pourrait pas être posé. Ces lignes ne portent aucune
-- information distincte : elles décrivent le même versement.
DELETE FROM public.errand_payments p
USING public.errand_payments q
WHERE p.errand_id = q.errand_id
  AND p.kind = q.kind
  AND p.payer_id = q.payer_id
  AND p.amount = q.amount
  AND COALESCE(p.reference, '') = COALESCE(q.reference, '')
  AND (p.created_at, p.id) > (q.created_at, q.id);

CREATE UNIQUE INDEX IF NOT EXISTS errand_payments_no_duplicate
  ON public.errand_payments (errand_id, kind, payer_id, amount, (COALESCE(reference, '')));

COMMENT ON INDEX public.errand_payments_no_duplicate IS
  'Un même versement ne peut pas être inscrit deux fois sur la même course.';

CREATE OR REPLACE FUNCTION public.guard_append_only_ledger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Une écriture financière ne se modifie pas. Corrigez-la par une nouvelle écriture.'
      USING ERRCODE = '42501';
  END IF;

  -- La suppression n'est tolérée que lorsque la course elle-même a disparu,
  -- ce qui n'arrive qu'à l'effacement d'un compte. Sans cette tolérance,
  -- l'effacement d'un compte deviendrait impossible ; avec elle, la trace
  -- reste indestructible tant que la course existe.
  IF EXISTS (SELECT 1 FROM public.errands e WHERE e.id = OLD.errand_id) THEN
    RAISE EXCEPTION 'Une écriture financière ne se supprime pas.'
      USING ERRCODE = '42501';
  END IF;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_append_only_ledger() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_errand_payments_append_only ON public.errand_payments;
CREATE TRIGGER trg_errand_payments_append_only
  BEFORE UPDATE OR DELETE ON public.errand_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_ledger();

-- Le privilège lui-même est retiré : le déclencheur est la seconde barrière,
-- pas la première.
REVOKE UPDATE, DELETE ON public.errand_payments FROM authenticated;

DROP POLICY IF EXISTS "Participants confirm payments" ON public.errand_payments;

-- ---------------------------------------------------------------------------
-- 3. L'historique d'une course devient lui aussi en ajout seul
--
-- errand_events datait chaque étape de la mission et sert de récit en cas de
-- litige. Il était insérable directement par les participants, donc forgeable,
-- et rien n'interdisait d'en réécrire une ligne gênante.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_errand_events_append_only ON public.errand_events;
CREATE TRIGGER trg_errand_events_append_only
  BEFORE UPDATE OR DELETE ON public.errand_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_append_only_ledger();

-- Les événements sont posés par le moteur, qui écrit sous son propre rôle.
-- Un participant qui les inscrirait lui-même pourrait antidater une étape.
DROP POLICY IF EXISTS "Participants insert events" ON public.errand_events;
REVOKE INSERT, UPDATE, DELETE ON public.errand_events FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. Barème figé sur la course
--
-- Les fonctions relisaient current_commission_rule() à chaque étape. Publier
-- un nouveau barème re-tarifait donc les missions en cours : le shopper
-- terminait sous des conditions qu'il n'avait jamais acceptées.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_commission_rule(p_errand_id uuid)
RETURNS public.commission_rules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.commission_rules;
BEGIN
  SELECT r.* INTO v_rule
  FROM public.errands e
  JOIN public.commission_rules r ON r.id = e.commission_rule_id
  WHERE e.id = p_errand_id;

  -- Les courses antérieures à cette migration n'ont pas de barème figé : le
  -- barème courant reste le seul repère disponible pour elles.
  IF NOT FOUND THEN
    v_rule := public.current_commission_rule();
  END IF;

  RETURN v_rule;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_commission_rule(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_commission_rule(uuid) TO authenticated;

-- Rattachement des courses existantes. À défaut de mieux, on retient le
-- barème dont le taux correspond à celui déjà inscrit sur la course.
DO $$
BEGIN
  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands e
  SET commission_rule_id = COALESCE(
    (SELECT r.id FROM public.commission_rules r
      WHERE r.rate = e.commission_rate
      ORDER BY r.version DESC LIMIT 1),
    (SELECT r.id FROM public.commission_rules r
      WHERE r.is_active = true
      ORDER BY r.version DESC LIMIT 1)
  )
  WHERE e.commission_rule_id IS NULL;
END
$$;

-- ---------------------------------------------------------------------------
-- 5. Garde de colonnes étendue aux nouvelles colonnes sensibles
--
-- Une colonne financière hors de la garde est une colonne écrivable par le
-- navigateur : c'est ainsi que les montants avaient été fixés à la main avant
-- la pose du moteur.
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
     OR NEW.overtime_grace_minutes IS DISTINCT FROM OLD.overtime_grace_minutes
     OR NEW.overtime_per_minute    IS DISTINCT FROM OLD.overtime_per_minute
     OR NEW.distance_grace_km      IS DISTINCT FROM OLD.distance_grace_km
     OR NEW.distance_per_km        IS DISTINCT FROM OLD.distance_per_km
     OR NEW.overrun_cap_ratio      IS DISTINCT FROM OLD.overrun_cap_ratio
     OR NEW.budget_tolerance_pct   IS DISTINCT FROM OLD.budget_tolerance_pct
     OR NEW.budget_tolerance_min   IS DISTINCT FROM OLD.budget_tolerance_min
     -- Barème figé, avance déclarée, accord de dépassement et compteur de
     -- codes : chacune de ces colonnes décide d'un montant ou d'un droit.
     OR NEW.commission_rule_id      IS DISTINCT FROM OLD.commission_rule_id
     OR NEW.advance_declared_amount IS DISTINCT FROM OLD.advance_declared_amount
     OR NEW.advance_declared_at     IS DISTINCT FROM OLD.advance_declared_at
     OR NEW.advance_confirmed_at    IS DISTINCT FROM OLD.advance_confirmed_at
     OR NEW.advance_proof_url       IS DISTINCT FROM OLD.advance_proof_url
     OR NEW.budget_approved_amount  IS DISTINCT FROM OLD.budget_approved_amount
     OR NEW.handover_attempts       IS DISTINCT FROM OLD.handover_attempts
     OR NEW.handover_locked_at      IS DISTINCT FROM OLD.handover_locked_at
     OR NEW.handover_verified_at    IS DISTINCT FROM OLD.handover_verified_at
  THEN
    RAISE EXCEPTION 'Les montants, le statut et l''affectation d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_errand_privileged_columns() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Code de remise tiré au sort, et tentatives comptées
--
-- Le code était tiré par random(), générateur déterministe : qui connaît son
-- amorce reconstitue la suite des codes émis. Il est désormais tiré sur
-- gen_random_bytes, et les échecs de vérification sont comptés pour qu'un
-- essai systématique se heurte à un verrou.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.generate_handover_code()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_octets bytea := gen_random_bytes(4);
  v_valeur bigint;
BEGIN
  v_valeur := get_byte(v_octets, 0)::bigint * 16777216
            + get_byte(v_octets, 1) * 65536
            + get_byte(v_octets, 2) * 256
            + get_byte(v_octets, 3);

  RETURN lpad((v_valeur % 10000)::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.generate_handover_code() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.generate_handover_code() IS
  'Code de remise à quatre chiffres tiré sur une source cryptographique.';

-- Point d'entrée de vérification du code. Il répond faux au lieu de lever une
-- erreur, précisément pour que le compteur d'échecs survive : une exception
-- annulerait la transaction, donc l'incrément lui-même, et aucun essai ne
-- serait jamais compté.
CREATE OR REPLACE FUNCTION public.errand_verify_handover_code(
  p_errand_id uuid,
  p_code      text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand   public.errands;
  v_code     text;
  v_essais   integer;
  v_seuil    constant integer := 5;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné vérifie le code de remise.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.handover_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'Trop de codes erronés ont été saisis. Un modérateur doit rouvrir la remise.'
      USING ERRCODE = '42501';
  END IF;

  v_code := regexp_replace(COALESCE(p_code, ''), '\s', '', 'g');

  PERFORM set_config('app.errand_engine', 'on', true);

  IF v_errand.handover_code IS NULL OR v_errand.handover_code = v_code THEN
    UPDATE public.errands SET
      handover_verified_at = now(),
      handover_attempts    = 0
    WHERE id = p_errand_id;

    RETURN true;
  END IF;

  v_essais := COALESCE(v_errand.handover_attempts, 0) + 1;

  UPDATE public.errands SET
    handover_attempts  = v_essais,
    handover_locked_at = CASE WHEN v_essais >= v_seuil THEN now() ELSE handover_locked_at END
  WHERE id = p_errand_id;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_verify_handover_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_verify_handover_code(uuid, text) TO authenticated;

-- Réouverture par la modération, seule issue une fois le verrou posé.
CREATE OR REPLACE FUNCTION public.errand_unlock_handover(
  p_errand_id uuid,
  p_reason    text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir une remise verrouillée.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    handover_attempts  = 0,
    handover_locked_at = NULL
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Remise rouverte par la modération' ||
    CASE WHEN p_reason IS NOT NULL THEN ' : ' || left(trim(p_reason), 300) ELSE '' END);

  PERFORM public.log_audit('unlock', 'errand_handover', p_errand_id::text, NULL::jsonb);

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_unlock_handover(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_unlock_handover(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Publication d'une course : barème figé et code tiré au sort
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_create(
  p_title             text,
  p_category          errand_category,
  p_city              text,
  p_zone              text,
  p_delivery_address  text,
  p_items             jsonb,
  p_budget_estimate   numeric,
  p_notes             text,
  p_preferred_contact text,
  p_scheduled_for     timestamptz,
  p_payment_method    pay_method,
  p_vehicle_required  text,
  p_volume_size       text,
  p_urgency           text,
  p_distance_km       numeric,
  p_estimated_minutes integer,
  p_dropoff_mode      dropoff_mode,
  p_third_party       text,
  p_fund_mode         fund_mode,
  p_lat               numeric DEFAULT NULL,
  p_lng               numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_rule       public.commission_rules;
  v_errand     public.errands;
  v_base       numeric(12,2);
  v_distance   numeric(12,2);
  v_minutes    integer;
  v_service    numeric(12,2);
  v_commission numeric(12,2);
  v_articles   integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté pour publier une course.' USING ERRCODE = '42501';
  END IF;

  IF coalesce(char_length(trim(p_title)), 0) < 3 THEN
    RAISE EXCEPTION 'Le titre de la course est trop court.' USING ERRCODE = '22023';
  END IF;

  IF coalesce(char_length(trim(p_delivery_address)), 0) < 3 THEN
    RAISE EXCEPTION 'L''adresse de remise est obligatoire.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(p_budget_estimate, 0) < 0 THEN
    RAISE EXCEPTION 'Le budget d''achat ne peut pas être négatif.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.current_commission_rule();
  v_distance := GREATEST(COALESCE(p_distance_km, 0), 0);
  v_minutes := GREATEST(COALESCE(p_estimated_minutes, 60), 0);
  v_articles := COALESCE(jsonb_array_length(p_items), 0);

  v_base :=
    CASE p_vehicle_required
      WHEN 'a_pied'      THEN 500
      WHEN 'moto'        THEN 700
      WHEN 'tricycle'    THEN 1200
      WHEN 'voiture'     THEN 1500
      WHEN 'camionnette' THEN 3000
      ELSE 700
    END
    + v_distance *
      CASE p_vehicle_required
        WHEN 'a_pied'      THEN 100
        WHEN 'moto'        THEN 130
        WHEN 'tricycle'    THEN 160
        WHEN 'voiture'     THEN 200
        WHEN 'camionnette' THEN 300
        ELSE 120
      END
    + GREATEST(v_minutes - 30, 0) * 10
    + CASE p_volume_size
        WHEN 'medium' THEN 500
        WHEN 'large'  THEN 1500
        WHEN 'xl'     THEN 3000
        ELSE 0
      END
    + CASE p_urgency WHEN 'express' THEN 1000 ELSE 0 END
    + GREATEST(v_articles - 10, 0) * 50
    + CASE p_dropoff_mode
        WHEN 'customer_pickup' THEN -500
        WHEN 'third_party'     THEN -300
        ELSE 0
      END;

  v_service := GREATEST(round(v_base / 50) * 50, v_rule.min_service_fee);
  v_commission := round(v_service * v_rule.rate, 2);

  INSERT INTO public.errands (
    customer_id, title, category, city, zone, delivery_address, lat, lng,
    items, budget_estimate, notes, preferred_contact, scheduled_for,
    payment_method, status, vehicle_required, volume_size, urgency,
    distance_km, estimated_minutes, dropoff_mode, third_party_contact,
    fund_mode, service_fee, commission_rate, commission_amount,
    runner_payout, total_amount, handover_code, commission_rule_id
  ) VALUES (
    v_uid, trim(p_title), p_category, p_city, NULLIF(trim(COALESCE(p_zone, '')), ''),
    trim(p_delivery_address), p_lat, p_lng,
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_budget_estimate, 0),
    NULLIF(trim(COALESCE(p_notes, '')), ''), COALESCE(p_preferred_contact, 'chat'),
    p_scheduled_for, COALESCE(p_payment_method, 'cash'::pay_method),
    'open'::errand_status, COALESCE(p_vehicle_required, 'any'),
    COALESCE(p_volume_size, 'small'), COALESCE(p_urgency, 'standard'),
    v_distance, v_minutes, COALESCE(p_dropoff_mode, 'runner_delivers'::dropoff_mode),
    NULLIF(trim(COALESCE(p_third_party, '')), ''),
    COALESCE(p_fund_mode, 'customer_advance'::fund_mode),
    v_service, v_rule.rate, v_commission,
    v_service - v_commission,
    COALESCE(p_budget_estimate, 0) + v_service,
    public.generate_handover_code(),
    -- Le barème appliqué est celui du jour de la publication, et il ne bougera
    -- plus : c'est celui que le client a vu au moment de s'engager.
    v_rule.id
  )
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(v_errand.id, 'open'::errand_status, 'Course publiée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_create(
  text, errand_category, text, text, text, jsonb, numeric, text, text,
  timestamptz, pay_method, text, text, text, numeric, integer, dropoff_mode,
  text, fund_mode, numeric, numeric
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.errand_create(
  text, errand_category, text, text, text, jsonb, numeric, text, text,
  timestamptz, pay_method, text, text, text, numeric, integer, dropoff_mode,
  text, fund_mode, numeric, numeric
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Acceptation d'une offre sous le barème de la course
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_accept_offer(p_offer_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer      public.errand_offers;
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_commission numeric(12,2);
  v_base       numeric(12,2);
BEGIN
  SELECT * INTO v_offer FROM public.errand_offers WHERE id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cette offre n''existe plus.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = v_offer.errand_id FOR UPDATE;
  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut accepter une offre.' USING ERRCODE = '42501';
  END IF;
  IF v_errand.status <> 'open'::errand_status THEN
    RAISE EXCEPTION 'Cette course n''est plus ouverte aux offres.' USING ERRCODE = '22023';
  END IF;
  IF v_offer.status <> 'pending'::offer_status THEN
    RAISE EXCEPTION 'Cette offre n''est plus disponible.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_approved_runner(v_offer.runner_id) THEN
    RAISE EXCEPTION 'Ce shopper n''est pas validé.' USING ERRCODE = '42501';
  END IF;

  v_rule := public.errand_commission_rule(v_errand.id);
  v_base := GREATEST(v_offer.price, v_rule.min_service_fee);
  v_commission := round(v_base * v_rule.rate, 2);

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    runner_id         = v_offer.runner_id,
    status            = 'assigned'::errand_status,
    service_fee       = v_base,
    commission_rate   = v_rule.rate,
    commission_amount = v_commission,
    runner_payout     = v_base - v_commission,
    total_amount      = COALESCE(budget_estimate, 0) + v_base + COALESCE(delivery_fee, 0),
    started_at        = now(),
    accepted_at       = now(),
    -- Une course publiée avant la mise en place du barème figé se voit
    -- rattacher celui sous lequel elle est réellement engagée.
    commission_rule_id = COALESCE(commission_rule_id, v_rule.id),
    -- Un shopper qui se désiste rend la course au marché : la remise déjà
    -- vérifiée avec lui ne doit rien valoir pour son successeur, sinon le
    -- suivant livrerait sans jamais rencontrer le client.
    handover_verified_at = NULL,
    handover_attempts    = 0,
    handover_locked_at   = NULL
  WHERE id = v_errand.id
  RETURNING * INTO v_errand;

  UPDATE public.errand_offers SET status = 'accepted'::offer_status WHERE id = p_offer_id;
  UPDATE public.errand_offers SET status = 'rejected'::offer_status
    WHERE errand_id = v_errand.id AND id <> p_offer_id AND status = 'pending'::offer_status;

  PERFORM public.log_errand_event(v_errand.id, 'assigned'::errand_status, 'Offre acceptée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_accept_offer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_accept_offer(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Progression de statut : verrou de remise honoré
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_advance_status(
  p_errand_id     uuid,
  p_next          errand_status,
  p_handover_code text DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_code   text;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné peut faire avancer cette course.' USING ERRCODE = '42501';
  END IF;

  IF NOT (
       (v_errand.status = 'assigned'::errand_status   AND p_next = 'shopping'::errand_status)
    OR (v_errand.status = 'shopping'::errand_status   AND p_next = 'delivering'::errand_status)
    OR (v_errand.status = 'delivering'::errand_status AND p_next = 'delivered'::errand_status)
  ) THEN
    RAISE EXCEPTION 'Cette progression de statut n''est pas autorisée.' USING ERRCODE = '22023';
  END IF;

  IF p_next = 'delivered'::errand_status THEN
    IF v_errand.handover_locked_at IS NOT NULL THEN
      RAISE EXCEPTION 'Trop de codes erronés ont été saisis. Un modérateur doit rouvrir la remise.'
        USING ERRCODE = '42501';
    END IF;

    v_code := regexp_replace(COALESCE(p_handover_code, ''), '\s', '', 'g');

    -- Un code déjà vérifié par errand_verify_handover_code vaut preuve : c'est
    -- ce chemin qui compte les échecs, celui-ci ne pouvant pas le faire sans
    -- annuler son propre compteur en levant l'erreur.
    IF v_errand.handover_verified_at IS NULL
       AND v_errand.handover_code IS NOT NULL
       AND v_errand.handover_code <> v_code THEN
      RAISE EXCEPTION 'Code de remise incorrect. Demandez au client le code affiché sur sa course.'
        USING ERRCODE = '22023';
    END IF;

    IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
      RAISE EXCEPTION 'Déposez le reçu des achats avant de marquer la course comme livrée.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    status        = p_next,
    shopping_at   = CASE WHEN p_next = 'shopping'::errand_status   THEN now() ELSE shopping_at   END,
    delivering_at = CASE WHEN p_next = 'delivering'::errand_status THEN now() ELSE delivering_at END,
    delivered_at  = CASE WHEN p_next = 'delivered'::errand_status  THEN now() ELSE delivered_at  END,
    handover_verified_at = CASE
      WHEN p_next = 'delivered'::errand_status THEN COALESCE(handover_verified_at, now())
      ELSE handover_verified_at
    END,
    actual_minutes = CASE
      WHEN p_next = 'delivered'::errand_status
      THEN GREATEST(
        EXTRACT(EPOCH FROM (now() - COALESCE(shopping_at, started_at, created_at)))::integer / 60,
        0
      )
      ELSE actual_minutes
    END
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(
    p_errand_id,
    p_next,
    CASE WHEN p_next = 'delivered'::errand_status THEN 'Remise confirmée par code' ELSE NULL END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_advance_status(uuid, errand_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_advance_status(uuid, errand_status, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. L'avance cesse d'être auto-déclarée
--
-- Le client annonçait lui-même le montant envoyé, et ce montant était traité
-- comme acquis : réputé confirmé, déduit du reste à payer, inscrit au registre
-- des paiements. Le shopper n'avait aucun moyen de dire qu'il n'avait rien
-- reçu. Une déclaration reste une déclaration tant que le destinataire ne l'a
-- pas reconnue.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_declare_advance(
  p_errand_id uuid,
  p_amount    numeric
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  IF p_amount IS NULL OR p_amount < 0 THEN
    RAISE EXCEPTION 'Le montant de l''avance ne peut pas être négatif.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut déclarer son avance.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  IF p_amount < COALESCE(v_errand.advance_amount, 0) THEN
    RAISE EXCEPTION 'Une avance déjà reconnue par le shopper ne peut pas être réduite.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    advance_declared_amount = p_amount,
    advance_declared_at     = now(),
    -- Le reste à payer ne tient compte que de l'avance reconnue reçue.
    balance_due             = GREATEST(COALESCE(total_amount, 0) - COALESCE(advance_amount, 0), 0)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Avance de ' || p_amount || ' FCFA déclarée par le client, en attente de confirmation du shopper');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_declare_advance(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_declare_advance(uuid, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.errand_confirm_advance(
  p_errand_id uuid,
  p_amount    numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_declare numeric(12,2);
  v_cible   numeric(12,2);
  v_delta   numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné peut confirmer avoir reçu l''avance.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  v_declare := GREATEST(COALESCE(v_errand.advance_declared_amount, 0), 0);
  v_cible := GREATEST(COALESCE(p_amount, v_declare), 0);

  IF v_declare <= 0 THEN
    RAISE EXCEPTION 'Le client n''a déclaré aucune avance sur cette course.' USING ERRCODE = '22023';
  END IF;

  -- Reconnaître plus que ce qui a été annoncé ferait sortir le registre de ce
  -- que les deux parties ont dit : le client doit d'abord corriger sa
  -- déclaration.
  IF v_cible > v_declare THEN
    RAISE EXCEPTION 'Le montant reçu ne peut pas dépasser le montant déclaré par le client.'
      USING ERRCODE = '22023';
  END IF;

  v_delta := v_cible - GREATEST(COALESCE(v_errand.advance_amount, 0), 0);

  IF v_delta <= 0 THEN
    RAISE EXCEPTION 'Aucun nouveau versement à confirmer sur cette course.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    advance_amount       = v_cible,
    advance_confirmed_at = now(),
    balance_due          = GREATEST(COALESCE(total_amount, 0) - v_cible, 0)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  -- Le registre n'enregistre que de l'argent dont la réception est reconnue :
  -- c'est ce qui lui donne sa valeur de preuve. La référence porte le cumulé
  -- atteint, qui distingue deux versements de même montant sur une course sans
  -- pour autant les confondre avec un doublon.
  INSERT INTO public.errand_payments (
    errand_id, payer_id, kind, method, amount, reference, confirmed_by, confirmed_at
  )
  VALUES (
    p_errand_id, v_errand.customer_id, 'shopping_advance'::errand_payment_kind,
    v_errand.payment_method, v_delta, 'cumul ' || v_cible, auth.uid(), now()
  );

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Avance de ' || v_delta || ' FCFA confirmée reçue par le shopper');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_confirm_advance(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_advance(uuid, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. Dépassement de budget : un accord porte sur un montant
--
-- L'accord ne posait qu'une date. Le shopper pouvait ensuite gonfler la
-- facture autant qu'il voulait : l'accord, sans montant, couvrait tout.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_approve_budget_overrun(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand  public.errands;
  v_montant numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client peut approuver un dépassement de budget.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  -- Le client approuve le montant qu'il a sous les yeux, c'est-à-dire la
  -- facture d'achats déjà enregistrée par le shopper.
  v_montant := GREATEST(COALESCE(v_errand.items_total, 0), 0);

  IF v_montant <= 0 THEN
    RAISE EXCEPTION 'Aucune facture d''achats n''a encore été enregistrée sur cette course.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    budget_overrun_pending = false,
    budget_approved_at     = now(),
    budget_approved_amount = v_montant
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Dépassement de budget approuvé par le client jusqu''à ' || v_montant || ' FCFA');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_approve_budget_overrun(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_approve_budget_overrun(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 12. Dépassement de mission calculé sous le barème de la course
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_compute_overrun(p_errand_id uuid)
RETURNS TABLE (
  overtime_minutes  integer,
  extra_distance_km numeric,
  overrun_fee       numeric,
  capped            boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand   public.errands;
  v_rule     public.commission_rules;
  v_debut    timestamptz;
  v_fin      timestamptz;
  v_ecoulees integer;
  v_sup_min  integer;
  v_sup_km   numeric(12,2);
  v_brut     numeric(12,2);
  v_plafond  numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_rule := public.errand_commission_rule(p_errand_id);

  v_debut := COALESCE(v_errand.shopping_at, v_errand.started_at, v_errand.created_at);
  v_fin := COALESCE(v_errand.delivered_at, now());

  v_ecoulees := GREATEST(EXTRACT(EPOCH FROM (v_fin - v_debut))::integer / 60, 0);

  v_sup_min := GREATEST(
    v_ecoulees - COALESCE(v_errand.estimated_minutes, 0) - v_rule.overtime_grace_minutes,
    0
  );

  v_sup_km := GREATEST(
    COALESCE(v_errand.actual_distance_km, 0)
      - COALESCE(v_errand.distance_km, 0)
      - v_rule.distance_grace_km,
    0
  );

  v_brut := round(v_sup_min * v_rule.overtime_per_minute + v_sup_km * v_rule.distance_per_km, 2);
  v_plafond := round(COALESCE(v_errand.service_fee, 0) * v_rule.overrun_cap_ratio, 2);

  overtime_minutes := v_sup_min;
  extra_distance_km := v_sup_km;
  overrun_fee := LEAST(v_brut, v_plafond);
  capped := v_brut > v_plafond;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_compute_overrun(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_compute_overrun(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 13. Facture : frais de livraison plafonné, commissionné, et accord de
--     dépassement invalidé dès qu'il est débordé
--
-- p_delivery_fee venait du shopper, n'avait aucun plafond, et échappait à la
-- commission : c'était une ligne libre sur la facture du client, hors de tout
-- partage. Le transport est pourtant une prestation du shopper, exactement
-- comme le frais de service. Il entre donc dans l'assiette de la commission et
-- dans la rémunération, et il est plafonné par le barème.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_save_invoice(
  p_errand_id   uuid,
  p_items_total numeric,
  p_delivery_fee numeric DEFAULT 0,
  p_tip_amount  numeric DEFAULT 0,
  p_receipt_url text    DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_commission numeric(12,2);
  v_total      numeric(12,2);
  v_depass     record;
  v_service    numeric(12,2);
  v_livraison  numeric(12,2);
  v_assiette   numeric(12,2);
  v_tolerance  numeric(12,2);
  v_ecart      boolean;
  v_accord     boolean;
  v_tip        numeric(12,2);
BEGIN
  IF p_items_total < 0 OR p_delivery_fee < 0 THEN
    RAISE EXCEPTION 'Les montants d''une facture ne peuvent pas être négatifs.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.runner_id IS NULL OR v_errand.runner_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le shopper assigné peut enregistrer la facture.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status NOT IN ('shopping'::errand_status, 'delivering'::errand_status, 'delivered'::errand_status) THEN
    RAISE EXCEPTION 'La facture ne peut être enregistrée qu''une fois les courses commencées.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Cette course est déjà réglée, sa facture ne peut plus être modifiée.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.errand_commission_rule(p_errand_id);

  v_livraison := GREATEST(COALESCE(p_delivery_fee, 0), 0);
  IF v_livraison > COALESCE(v_rule.delivery_fee_cap, 0) THEN
    RAISE EXCEPTION 'Les frais de livraison dépassent le plafond autorisé de % FCFA.',
      v_rule.delivery_fee_cap USING ERRCODE = '22023';
  END IF;

  -- Le pourboire vient du client, jamais de la facture du shopper.
  v_tip := GREATEST(COALESCE(v_errand.tip_amount, 0), 0);

  v_tolerance := GREATEST(
    COALESCE(v_errand.budget_estimate, 0) * v_rule.budget_tolerance_pct / 100,
    v_rule.budget_tolerance_min
  );
  v_ecart := p_items_total > COALESCE(v_errand.budget_estimate, 0) + v_tolerance;

  -- Un accord porte sur un montant précis : dès que la facture le dépasse, il
  -- tombe, et le client doit se prononcer de nouveau.
  v_accord := v_errand.budget_approved_at IS NOT NULL
              AND p_items_total <= COALESCE(v_errand.budget_approved_amount, 0);

  SELECT * INTO v_depass FROM public.errand_compute_overrun(p_errand_id);

  v_service := COALESCE(v_errand.service_fee, 0) + COALESCE(v_depass.overrun_fee, 0);
  v_assiette := v_service
    + CASE WHEN v_rule.base = 'service_and_delivery' THEN v_livraison ELSE 0 END;
  v_commission := round(v_assiette * v_rule.rate, 2);
  v_total := p_items_total + v_service + v_livraison + v_tip;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    items_total       = p_items_total,
    delivery_fee      = v_livraison,
    overtime_minutes  = COALESCE(v_depass.overtime_minutes, 0),
    extra_distance_km = COALESCE(v_depass.extra_distance_km, 0),
    overrun_fee       = COALESCE(v_depass.overrun_fee, 0),
    commission_rate   = v_rule.rate,
    commission_amount = v_commission,
    -- Le transport revient au shopper comme le service : ni l'un ni l'autre
    -- ne doit rester sans destinataire sur la facture.
    runner_payout     = v_service + v_livraison - v_commission + v_tip,
    total_amount      = v_total,
    balance_due       = GREATEST(v_total - COALESCE(v_errand.advance_amount, 0), 0),
    receipt_url       = COALESCE(p_receipt_url, receipt_url),
    budget_approved_at     = CASE WHEN v_accord THEN budget_approved_at ELSE NULL END,
    budget_approved_amount = CASE WHEN v_accord THEN budget_approved_amount ELSE NULL END,
    budget_overrun_pending = (v_ecart AND NOT v_accord)
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(
    p_errand_id,
    v_errand.status,
    CASE
      WHEN v_ecart AND NOT v_accord
        THEN 'Facture enregistrée, dépassement de budget en attente d''accord du client'
      WHEN COALESCE(v_depass.overrun_fee, 0) > 0
        THEN 'Facture enregistrée, dépassement de ' || v_depass.overtime_minutes || ' min'
      ELSE 'Facture enregistrée'
    END
  );

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_save_invoice(uuid, numeric, numeric, numeric, text) TO authenticated;

-- Le pourboire suit la même arithmétique que la facture, sans quoi le premier
-- pourboire laissé effacerait la part de livraison du gain du shopper.
CREATE OR REPLACE FUNCTION public.errand_add_tip(
  p_errand_id uuid,
  p_amount    numeric
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
  v_rule   public.commission_rules;
  v_tip    numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client peut laisser un pourboire.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'La course est déjà réglée.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.errand_commission_rule(p_errand_id);
  v_tip := round(GREATEST(COALESCE(p_amount, 0), 0));

  IF v_tip > COALESCE(v_rule.tip_cap, 20000) THEN
    RAISE EXCEPTION 'Le pourboire dépasse le plafond autorisé.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    tip_amount    = v_tip,
    total_amount  = COALESCE(items_total, 0) + COALESCE(service_fee, 0)
                    + COALESCE(delivery_fee, 0) + COALESCE(overrun_fee, 0) + v_tip,
    runner_payout = GREATEST(COALESCE(service_fee, 0) + COALESCE(overrun_fee, 0)
                             + COALESCE(delivery_fee, 0) - COALESCE(commission_amount, 0), 0) + v_tip,
    balance_due   = GREATEST(
                      COALESCE(items_total, 0) + COALESCE(service_fee, 0)
                      + COALESCE(delivery_fee, 0) + COALESCE(overrun_fee, 0) + v_tip
                      - COALESCE(advance_amount, 0), 0),
    updated_at    = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_add_tip(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_add_tip(uuid, numeric) TO authenticated;

-- Publier un barème inscrit désormais explicitement l'assiette retenue.
CREATE OR REPLACE FUNCTION public.commission_rule_publish(
  p_rate              numeric,
  p_min_service_fee   numeric,
  p_min_payout        numeric,
  p_hold_hours        integer,
  p_overtime_grace    integer,
  p_overtime_per_min  numeric,
  p_distance_grace_km numeric,
  p_distance_per_km   numeric,
  p_overrun_cap_ratio numeric,
  p_budget_tol_pct    numeric,
  p_budget_tol_min    numeric
)
RETURNS public.commission_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_version integer;
  v_regle   public.commission_rules;
  v_ancien  public.commission_rules;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Seul un administrateur peut publier un barème.' USING ERRCODE = '42501';
  END IF;

  IF p_rate < 0 OR p_rate > 0.5 THEN
    RAISE EXCEPTION 'Le taux de commission doit rester entre 0 et 50 pour cent.' USING ERRCODE = '22023';
  END IF;

  v_ancien := public.current_commission_rule();

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.commission_rules;

  UPDATE public.commission_rules SET is_active = false WHERE is_active = true;

  -- Les plafonds du pourboire et de la livraison sont repris du barème
  -- précédent : une console qui ne les expose pas encore ne doit pas les
  -- réinitialiser à son insu.
  INSERT INTO public.commission_rules (
    version, rate, base, min_service_fee, min_payout, hold_hours, is_active,
    overtime_grace_minutes, overtime_per_minute, distance_grace_km,
    distance_per_km, overrun_cap_ratio, budget_tolerance_pct, budget_tolerance_min,
    tip_cap, delivery_fee_cap
  ) VALUES (
    v_version, p_rate, 'service_and_delivery', p_min_service_fee, p_min_payout,
    p_hold_hours, true,
    p_overtime_grace, p_overtime_per_min, p_distance_grace_km,
    p_distance_per_km, p_overrun_cap_ratio, p_budget_tol_pct, p_budget_tol_min,
    COALESCE(v_ancien.tip_cap, 20000), COALESCE(v_ancien.delivery_fee_cap, 5000)
  )
  RETURNING * INTO v_regle;

  PERFORM public.log_audit('publish', 'commission_rule', v_version::text,
    jsonb_build_object('rate', p_rate, 'min_payout', p_min_payout));

  RETURN v_regle;
END;
$$;

REVOKE ALL ON FUNCTION public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Clôture sous le barème de la course
--
-- Le délai anti-litige était lu dans le barème du jour de la clôture. Publier
-- un délai plus long retenait rétroactivement des gains déjà acquis.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_confirm_payment(
  p_errand_id uuid
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand     public.errands;
  v_rule       public.commission_rules;
  v_payout     numeric(12,2);
  v_commission numeric(12,2);
  v_brut       numeric(12,2);
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut confirmer le règlement.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status <> 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course doit être marquée comme livrée avant confirmation.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RETURN v_errand;
  END IF;

  IF v_errand.items_total > 0 AND v_errand.receipt_url IS NULL THEN
    RAISE EXCEPTION 'Le reçu des achats doit être déposé avant la clôture.' USING ERRCODE = '22023';
  END IF;

  v_rule := public.errand_commission_rule(p_errand_id);
  v_payout := GREATEST(COALESCE(v_errand.runner_payout, 0), 0);
  v_commission := GREATEST(COALESCE(v_errand.commission_amount, 0), 0);
  v_brut := v_payout + v_commission;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    status         = 'completed'::errand_status,
    payment_status = 'paid'::pay_status,
    actual_minutes = COALESCE(
      actual_minutes,
      GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(started_at, created_at)))::integer / 60, 0)
    )
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF v_errand.runner_id IS NOT NULL AND v_payout > 0 THEN
    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, matures_at)
    SELECT v_errand.runner_id, v_errand.id, 'earning'::wallet_entry_kind, v_brut,
           'Frais de service, course ' || left(v_errand.title, 60),
           now() + make_interval(hours => COALESCE(v_rule.hold_hours, 24))
    WHERE NOT EXISTS (
      SELECT 1 FROM public.wallet_entries w
      WHERE w.errand_id = v_errand.id AND w.kind = 'earning'::wallet_entry_kind
    );

    INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
    SELECT v_errand.runner_id, v_errand.id, 'commission'::wallet_entry_kind,
           -v_commission, 'Commission Akwaba', now()
    WHERE v_commission > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_entries w
        WHERE w.errand_id = v_errand.id AND w.kind = 'commission'::wallet_entry_kind
      );

    INSERT INTO public.runner_wallets (user_id) VALUES (v_errand.runner_id)
      ON CONFLICT (user_id) DO NOTHING;

    UPDATE public.runner_wallets SET
      pending_balance   = pending_balance + v_payout,
      lifetime_earnings = lifetime_earnings + v_payout
    WHERE user_id = v_errand.runner_id;

    UPDATE public.runner_profiles SET jobs_completed = jobs_completed + 1
    WHERE user_id = v_errand.runner_id;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'completed'::errand_status, 'Course réglée et clôturée');

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_confirm_payment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_confirm_payment(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 15. Le gel d'un litige ne puise plus dans les gains des autres courses
--
-- Le gel portait sur runner_payout, montant théorique inscrit sur la course,
-- et le prenait sur le solde global du portefeuille. Ouvrir un litige sur une
-- course jamais créditée bloquait donc l'argent gagné ailleurs, sur des
-- missions terminées et acceptées. Le gel se limite désormais à ce que cette
-- course a effectivement porté au portefeuille.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_open_dispute(
  p_errand_id uuid,
  p_reason    text
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand     public.errands;
  v_wallet     public.runner_wallets;
  v_credite    numeric(12,2);
  v_deja_gele  numeric(12,2);
  v_a_geler    numeric(12,2);
  v_du_pending numeric(12,2);
  v_du_dispo   numeric(12,2);
BEGIN
  IF coalesce(char_length(trim(p_reason)), 0) < 10 THEN
    RAISE EXCEPTION 'Merci de décrire le litige en quelques mots (10 caractères minimum).' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.is_errand_participant(p_errand_id, auth.uid()) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status IN ('cancelled'::errand_status, 'disputed'::errand_status) THEN
    RAISE EXCEPTION 'Un litige est déjà ouvert ou la course est annulée.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET status = 'disputed'::errand_status
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF v_errand.runner_id IS NOT NULL THEN
    -- Ce que cette course a réellement crédité : le gain brut, diminué de la
    -- commission retenue. Une course non encore réglée n'a rien crédité, donc
    -- rien à geler.
    SELECT COALESCE(sum(amount), 0) INTO v_credite
    FROM public.wallet_entries
    WHERE errand_id = p_errand_id
      AND kind IN ('earning'::wallet_entry_kind, 'commission'::wallet_entry_kind);

    -- Un litige rouvert ne gèle pas deux fois la même somme.
    SELECT COALESCE(-sum(amount), 0) INTO v_deja_gele
    FROM public.wallet_entries
    WHERE errand_id = p_errand_id
      AND kind = 'adjustment'::wallet_entry_kind;

    v_a_geler := GREATEST(COALESCE(v_credite, 0) - GREATEST(COALESCE(v_deja_gele, 0), 0), 0);

    SELECT * INTO v_wallet FROM public.runner_wallets
    WHERE user_id = v_errand.runner_id FOR UPDATE;

    IF FOUND AND v_a_geler > 0 THEN
      -- On gèle d'abord ce qui est encore en attente, puis, si les gains ont
      -- déjà mûri, ce qui est passé en disponible.
      v_du_pending := LEAST(GREATEST(v_wallet.pending_balance, 0), v_a_geler);
      v_du_dispo := LEAST(GREATEST(v_wallet.available_balance, 0), v_a_geler - v_du_pending);

      UPDATE public.runner_wallets SET
        pending_balance   = pending_balance - v_du_pending,
        available_balance = available_balance - v_du_dispo
      WHERE user_id = v_errand.runner_id;

      IF v_du_pending + v_du_dispo > 0 THEN
        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind,
                -(v_du_pending + v_du_dispo), 'Gains gelés, litige en cours', now());
      END IF;
    END IF;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, 'disputed'::errand_status, left(trim(p_reason), 500));

  RETURN v_errand;
END;
$$;

REVOKE ALL ON FUNCTION public.errand_open_dispute(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.errand_open_dispute(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 16. L'identité validée d'un shopper ne se réécrit plus après approbation
--
-- Une fois le dossier approuvé, le shopper pouvait encore changer son nom et
-- sa pièce d'identité. La vérification portait alors sur un dossier qui
-- n'existe plus : n'importe qui pouvait faire valider une identité puis lui en
-- substituer une autre.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_runner_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
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

  -- Nom et pièce d'identité sont ce que la modération a examiné. Les laisser
  -- modifiables après coup revient à valider un dossier vide. Le reste de la
  -- fiche, dont les moyens de contact, demeure librement modifiable.
  IF OLD.status = 'approved'::runner_status THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'Votre nom a été vérifié : sa modification passe par la modération.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id_doc_url IS DISTINCT FROM OLD.id_doc_url THEN
      RAISE EXCEPTION 'Votre pièce d''identité a été vérifiée : son remplacement passe par la modération.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_runner_profile_privileged_columns() FROM PUBLIC, anon, authenticated;

-- Le compte qui reçoit l'argent fait partie du dossier vérifié : le changer
-- après approbation permettrait de détourner les avances des clients vers un
-- numéro que personne n'a contrôlé.
CREATE OR REPLACE FUNCTION public.guard_payout_account_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_verifie boolean;
BEGIN
  IF v_uid IS NULL
     OR public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'moderator'::app_role) THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Un compte de retrait ne peut pas changer de propriétaire.' USING ERRCODE = '42501';
  END IF;

  v_verifie := public.is_approved_runner(v_uid);

  IF NOT v_verifie THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Votre compte de réception a été vérifié : sa suppression passe par la modération.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.runner_payout_accounts a WHERE a.user_id = v_uid) THEN
      RAISE EXCEPTION 'Votre compte de réception a été vérifié : en ajouter un autre passe par la modération.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider       IS DISTINCT FROM OLD.provider
     OR NEW.account_number IS DISTINCT FROM OLD.account_number
     OR NEW.account_name   IS DISTINCT FROM OLD.account_name THEN
    RAISE EXCEPTION 'Votre compte de réception a été vérifié : sa modification passe par la modération.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_payout_account_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payout_accounts_guard ON public.runner_payout_accounts;
CREATE TRIGGER trg_payout_accounts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.runner_payout_accounts
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_payout_account_columns();

-- Seule issue pour un shopper dont l'identité ou le compte doit changer : la
-- modération rouvre le dossier, qui repasse alors par la vérification.
CREATE OR REPLACE FUNCTION public.runner_identity_reopen(
  p_user_id uuid,
  p_reason  text DEFAULT NULL
)
RETURNS public.runner_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profil public.runner_profiles;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir un dossier d''identité.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.runner_profiles SET
    status = 'pending'::runner_status
  WHERE user_id = p_user_id
  RETURNING * INTO v_profil;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit('reopen', 'runner_identity', p_user_id::text,
    jsonb_build_object('motif', left(COALESCE(trim(p_reason), ''), 300)));

  RETURN v_profil;
END;
$$;

REVOKE ALL ON FUNCTION public.runner_identity_reopen(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.runner_identity_reopen(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 17. Rafraîchissement des privilèges de lecture
--
-- Sept colonnes viennent d'être ajoutées à errands. Sans cet appel, elles
-- restent illisibles et l'écran de détail d'une course tombe en 42501.
-- ---------------------------------------------------------------------------

SELECT public.refresh_errand_column_grants();
