-- Barème tarifaire administrable, versionné, modulable par ville.
--
-- Le prix d'une course était calculé à partir de nombres écrits en dur à deux
-- endroits : dans le navigateur (src/modules/errands/pricing.ts) et dans la
-- fonction errand_create. Deux conséquences.
--
-- La première est qu'aucun exploitant ne peut changer un tarif. Relever le
-- prix au kilomètre de la camionnette demandait de modifier du TypeScript, de
-- modifier du PL/pgSQL, de reconstruire l'application et de la redéployer. Un
-- barème qu'on ne peut pas changer sans un développeur n'est pas un barème,
-- c'est une constante.
--
-- La seconde est que les deux copies pouvaient diverger. Un script de parité
-- les comparait après coup, ce qui suppose que quelqu'un le lance. Ici, les
-- nombres n'existent plus qu'une fois, en base, et les deux calculs les lisent.
--
-- Le barème gagne aussi une dimension géographique. Une course de cinq
-- kilomètres à Korhogo et la même à Abidjan coûtaient exactement le même prix,
-- alors que le carburant, les distances utiles et le revenu local n'ont rien
-- de commun. Chaque ville porte désormais deux coefficients, sur la prise en
-- charge et sur le kilomètre, et peut imposer son propre plancher de service.
--
-- Cette migration ne change aucun prix. La version 1 reprend au franc près les
-- valeurs appliquées aujourd'hui, et tous les coefficients de ville valent 1.
-- Faire varier un tarif est une décision d'exploitation, pas une migration.

-- ---------------------------------------------------------------------------
-- 1. En-tête de barème : ce qui ne dépend ni du véhicule ni de la ville
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version           integer      NOT NULL UNIQUE,
  label             text         NOT NULL,

  -- Temps : les premières minutes ne se facturent pas, au-delà on compte.
  free_minutes      integer      NOT NULL DEFAULT 30  CHECK (free_minutes >= 0),
  per_minute        numeric(12,2) NOT NULL DEFAULT 10 CHECK (per_minute >= 0),

  -- Panier : une liste longue tient le shopper plus longtemps en rayon.
  items_included    integer      NOT NULL DEFAULT 10  CHECK (items_included >= 0),
  per_extra_item    numeric(12,2) NOT NULL DEFAULT 50 CHECK (per_extra_item >= 0),

  -- Encombrement.
  volume_small      numeric(12,2) NOT NULL DEFAULT 0    CHECK (volume_small  >= 0),
  volume_medium     numeric(12,2) NOT NULL DEFAULT 500  CHECK (volume_medium >= 0),
  volume_large      numeric(12,2) NOT NULL DEFAULT 1500 CHECK (volume_large  >= 0),
  volume_xl         numeric(12,2) NOT NULL DEFAULT 3000 CHECK (volume_xl     >= 0),

  -- Urgence.
  urgency_scheduled numeric(12,2) NOT NULL DEFAULT 0    CHECK (urgency_scheduled >= 0),
  urgency_standard  numeric(12,2) NOT NULL DEFAULT 0    CHECK (urgency_standard  >= 0),
  urgency_express   numeric(12,2) NOT NULL DEFAULT 1000 CHECK (urgency_express   >= 0),

  -- Remise. Ces trois valeurs sont des remises, donc négatives ou nulles :
  -- un client qui vient chercher lui-même épargne un déplacement au shopper.
  dropoff_runner    numeric(12,2) NOT NULL DEFAULT 0    CHECK (dropoff_runner   <= 0),
  dropoff_third     numeric(12,2) NOT NULL DEFAULT -300 CHECK (dropoff_third    <= 0),
  dropoff_pickup    numeric(12,2) NOT NULL DEFAULT -500 CHECK (dropoff_pickup   <= 0),

  -- Le prix affiché tombe sur un pas rond : personne n'annonce 2 137 FCFA.
  rounding_step     integer      NOT NULL DEFAULT 50 CHECK (rounding_step BETWEEN 1 AND 1000),

  is_active         boolean      NOT NULL DEFAULT false,
  effective_from    timestamptz  NOT NULL DEFAULT now(),
  created_by        uuid         REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

-- Un seul barème en vigueur à la fois. Deux barèmes actifs, et le prix dépend
-- de l'ordre de lecture, donc du hasard.
CREATE UNIQUE INDEX IF NOT EXISTS pricing_rules_un_seul_actif
  ON public.pricing_rules ((true)) WHERE is_active;

-- ---------------------------------------------------------------------------
-- 2. Grille par véhicule : prise en charge et prix au kilomètre
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pricing_vehicle_rates (
  rule_id  uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  vehicle  text NOT NULL CHECK (vehicle IN ('any','a_pied','moto','tricycle','voiture','camionnette')),
  base     numeric(12,2) NOT NULL CHECK (base   >= 0),
  per_km   numeric(12,2) NOT NULL CHECK (per_km >= 0),
  PRIMARY KEY (rule_id, vehicle)
);

-- ---------------------------------------------------------------------------
-- 3. Modulation par ville
--
-- Le barème reste unique ; la ville l'ajuste. Une ville absente de cette table
-- applique le barème tel quel, ce qui évite qu'oublier d'y inscrire une ville
-- nouvelle rende ses courses impossibles à chiffrer.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.pricing_city_rates (
  rule_id           uuid NOT NULL REFERENCES public.pricing_rules(id) ON DELETE CASCADE,
  city_slug         text NOT NULL REFERENCES public.service_cities(slug) ON DELETE CASCADE,
  base_multiplier   numeric(6,3) NOT NULL DEFAULT 1 CHECK (base_multiplier   BETWEEN 0.1 AND 5),
  per_km_multiplier numeric(6,3) NOT NULL DEFAULT 1 CHECK (per_km_multiplier BETWEEN 0.1 AND 5),
  -- Plancher propre à la ville. NULL veut dire « celui du barème de commission ».
  min_service_fee   numeric(12,2) CHECK (min_service_fee IS NULL OR min_service_fee >= 0),
  PRIMARY KEY (rule_id, city_slug)
);

-- Chaque course garde la version de grille qui lui a été appliquée. Sans cela,
-- une facture contestée six mois plus tard serait recalculée avec le barème du
-- jour de la contestation, pas celui du jour de la course.
ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS pricing_rule_id uuid REFERENCES public.pricing_rules(id);

-- ---------------------------------------------------------------------------
-- 4. Version 1 : exactement les tarifs appliqués aujourd'hui
--
-- Reprise à l'identique des valeurs de errand_create et de pricing.ts. Aucune
-- course ne change de prix du fait de cette migration.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pricing_rules WHERE version = 1) THEN
    RETURN;
  END IF;

  INSERT INTO public.pricing_rules (version, label, is_active)
  VALUES (1, 'Barème d''origine, repris du code', true)
  RETURNING id INTO v_id;

  INSERT INTO public.pricing_vehicle_rates (rule_id, vehicle, base, per_km) VALUES
    (v_id, 'any',          700, 120),
    (v_id, 'a_pied',       500, 100),
    (v_id, 'moto',         700, 130),
    (v_id, 'tricycle',    1200, 160),
    (v_id, 'voiture',     1500, 200),
    (v_id, 'camionnette', 3000, 300);

  -- Toutes les villes au coefficient neutre : la mécanique existe, la
  -- décision de faire varier un tarif appartient à l'exploitant.
  INSERT INTO public.pricing_city_rates (rule_id, city_slug)
  SELECT v_id, slug FROM public.service_cities;
END $$;

-- ---------------------------------------------------------------------------
-- 5. Lecture : le barème en vigueur, sous une forme que le navigateur consomme
--
-- Le composeur de course a besoin de la grille entière pour chiffrer en direct
-- pendant que le client remplit son formulaire. Un aller-retour par frappe
-- serait inutilisable ; il lit donc la grille une fois.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.active_pricing_grid()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ruleId',          r.id,
    'version',         r.version,
    'label',           r.label,
    'freeMinutes',     r.free_minutes,
    'perMinute',       r.per_minute,
    'itemsIncluded',   r.items_included,
    'perExtraItem',    r.per_extra_item,
    'roundingStep',    r.rounding_step,
    'volume',   jsonb_build_object('small', r.volume_small, 'medium', r.volume_medium,
                                   'large', r.volume_large, 'xl', r.volume_xl),
    'urgency',  jsonb_build_object('scheduled', r.urgency_scheduled,
                                   'standard', r.urgency_standard,
                                   'express', r.urgency_express),
    'dropoff',  jsonb_build_object('runner_delivers', r.dropoff_runner,
                                   'third_party', r.dropoff_third,
                                   'customer_pickup', r.dropoff_pickup),
    'vehicles', (SELECT jsonb_object_agg(v.vehicle,
                          jsonb_build_object('base', v.base, 'perKm', v.per_km))
                 FROM public.pricing_vehicle_rates v WHERE v.rule_id = r.id),
    'cities',   COALESCE((SELECT jsonb_object_agg(c.city_slug,
                          jsonb_build_object('baseMultiplier', c.base_multiplier,
                                             'perKmMultiplier', c.per_km_multiplier,
                                             'minServiceFee', c.min_service_fee))
                 FROM public.pricing_city_rates c WHERE c.rule_id = r.id), '{}'::jsonb),
    'commission', jsonb_build_object('rate', k.rate, 'minServiceFee', k.min_service_fee)
  )
  FROM public.pricing_rules r
  CROSS JOIN LATERAL (SELECT * FROM public.current_commission_rule()) k
  WHERE r.is_active AND r.effective_from <= now()
  ORDER BY r.version DESC
  LIMIT 1;
$$;

-- ---------------------------------------------------------------------------
-- 6. Le calcul, écrit une fois
--
-- Toute somme facturée sort d'ici. La fonction rend le détail ligne par ligne,
-- pas seulement le total : une facture contestée se discute sur ses termes, et
-- la console d'administration doit pouvoir montrer d'où vient chaque franc.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pricing_quote(
  p_city         text,
  p_vehicle      text,
  p_volume       text,
  p_urgency      text,
  p_dropoff      text,
  p_distance_km  numeric,
  p_minutes      integer,
  p_items_count  integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r            public.pricing_rules;
  v_veh        public.pricing_vehicle_rates;
  v_city       public.pricing_city_rates;
  k            public.commission_rules;
  v_distance   numeric(12,2);
  v_minutes    integer;
  v_items      integer;
  v_base       numeric(12,2);
  v_distfee    numeric(12,2);
  v_timefee    numeric(12,2);
  v_volfee     numeric(12,2);
  v_urgfee     numeric(12,2);
  v_itemfee    numeric(12,2);
  v_dropadj    numeric(12,2);
  v_brut       numeric(12,2);
  v_plancher   numeric(12,2);
  v_service    numeric(12,2);
  v_commission numeric(12,2);
BEGIN
  SELECT * INTO r FROM public.pricing_rules
   WHERE is_active AND effective_from <= now()
   ORDER BY version DESC LIMIT 1;

  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Aucun barème tarifaire n''est en vigueur.' USING ERRCODE = '22023';
  END IF;

  k := public.current_commission_rule();

  -- Véhicule inconnu : on retombe sur « peu importe », qui est le tarif que le
  -- client voit quand il ne choisit rien. Refuser serait pire : la course ne
  -- pourrait plus être publiée à cause d'une valeur d'interface.
  SELECT * INTO v_veh FROM public.pricing_vehicle_rates
   WHERE rule_id = r.id AND vehicle = COALESCE(p_vehicle, 'any');
  IF v_veh.rule_id IS NULL THEN
    SELECT * INTO v_veh FROM public.pricing_vehicle_rates
     WHERE rule_id = r.id AND vehicle = 'any';
  END IF;

  -- La course enregistre la ville par son nom d'affichage (« Abidjan »), le
  -- referentiel par son identifiant (« abidjan »). Chercher l'un sans l'autre
  -- rendait la modulation par ville inoperante sans que rien ne le signale :
  -- aucune ligne ne correspondait, donc tous les coefficients valaient 1.
  -- Ville absente de la grille : coefficients neutres, la course reste chiffrable.
  SELECT c.* INTO v_city
    FROM public.pricing_city_rates c
    JOIN public.service_cities s ON s.slug = c.city_slug
   WHERE c.rule_id = r.id
     AND (c.city_slug = p_city OR lower(s.name) = lower(COALESCE(p_city, '')))
   LIMIT 1;

  v_distance := GREATEST(COALESCE(p_distance_km, 0), 0);
  v_minutes  := GREATEST(COALESCE(p_minutes, 60), 0);
  v_items    := GREATEST(COALESCE(p_items_count, 0), 0);

  v_base    := v_veh.base   * COALESCE(v_city.base_multiplier, 1);
  v_distfee := v_distance   * v_veh.per_km * COALESCE(v_city.per_km_multiplier, 1);
  v_timefee := GREATEST(v_minutes - r.free_minutes, 0) * r.per_minute;
  v_volfee  := CASE COALESCE(p_volume, 'small')
                 WHEN 'medium' THEN r.volume_medium
                 WHEN 'large'  THEN r.volume_large
                 WHEN 'xl'     THEN r.volume_xl
                 ELSE r.volume_small END;
  v_urgfee  := CASE COALESCE(p_urgency, 'standard')
                 WHEN 'scheduled' THEN r.urgency_scheduled
                 WHEN 'express'   THEN r.urgency_express
                 ELSE r.urgency_standard END;
  v_itemfee := GREATEST(v_items - r.items_included, 0) * r.per_extra_item;
  v_dropadj := CASE COALESCE(p_dropoff, 'runner_delivers')
                 WHEN 'third_party'     THEN r.dropoff_third
                 WHEN 'customer_pickup' THEN r.dropoff_pickup
                 ELSE r.dropoff_runner END;

  v_brut     := v_base + v_distfee + v_timefee + v_volfee + v_urgfee + v_itemfee + v_dropadj;
  v_plancher := COALESCE(v_city.min_service_fee, k.min_service_fee);
  v_service  := GREATEST(round(v_brut / r.rounding_step) * r.rounding_step, v_plancher);
  v_commission := round(v_service * k.rate, 2);

  RETURN jsonb_build_object(
    'ruleId', r.id, 'version', r.version,
    'base', v_base, 'distanceFee', v_distfee, 'timeFee', v_timefee,
    'volumeFee', v_volfee, 'urgencyFee', v_urgfee, 'itemsFee', v_itemfee,
    'dropoffAdjustment', v_dropadj,
    'raw', v_brut, 'minServiceFee', v_plancher,
    'serviceFee', v_service, 'commissionRate', k.rate,
    'commission', v_commission, 'runnerPayout', v_service - v_commission
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. errand_create lit désormais le barème au lieu de le contenir
--
-- Même signature, même comportement, mêmes montants pour la version 1. Seule
-- la provenance des nombres change : ils viennent de la base.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_create(
  p_title text, p_category errand_category, p_city text, p_zone text,
  p_delivery_address text, p_items jsonb, p_budget_estimate numeric,
  p_notes text, p_preferred_contact text, p_scheduled_for timestamptz,
  p_payment_method pay_method, p_vehicle_required text, p_volume_size text,
  p_urgency text, p_distance_km numeric, p_estimated_minutes integer,
  p_dropoff_mode dropoff_mode, p_third_party text, p_fund_mode fund_mode,
  -- Les deux valeurs par defaut existent depuis l'origine : les retirer
  -- casserait tous les appels qui ne passent pas de coordonnees.
  p_lat numeric DEFAULT NULL, p_lng numeric DEFAULT NULL
)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_rule   public.commission_rules;
  v_errand public.errands;
  v_devis  jsonb;
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

  v_rule  := public.current_commission_rule();
  v_devis := public.pricing_quote(
    p_city, COALESCE(p_vehicle_required, 'any'), COALESCE(p_volume_size, 'small'),
    COALESCE(p_urgency, 'standard'), COALESCE(p_dropoff_mode, 'runner_delivers')::text,
    GREATEST(COALESCE(p_distance_km, 0), 0), GREATEST(COALESCE(p_estimated_minutes, 60), 0),
    COALESCE(jsonb_array_length(p_items), 0)
  );

  INSERT INTO public.errands (
    customer_id, title, category, city, zone, delivery_address, lat, lng,
    items, budget_estimate, notes, preferred_contact, scheduled_for,
    payment_method, status, vehicle_required, volume_size, urgency,
    distance_km, estimated_minutes, dropoff_mode, third_party_contact,
    fund_mode, service_fee, commission_rate, commission_amount,
    runner_payout, total_amount, handover_code, commission_rule_id, pricing_rule_id
  ) VALUES (
    v_uid, trim(p_title), p_category, p_city, NULLIF(trim(COALESCE(p_zone, '')), ''),
    trim(p_delivery_address), p_lat, p_lng,
    COALESCE(p_items, '[]'::jsonb), COALESCE(p_budget_estimate, 0),
    NULLIF(trim(COALESCE(p_notes, '')), ''), COALESCE(p_preferred_contact, 'chat'),
    p_scheduled_for, COALESCE(p_payment_method, 'cash'::pay_method),
    'open'::errand_status, COALESCE(p_vehicle_required, 'any'),
    COALESCE(p_volume_size, 'small'), COALESCE(p_urgency, 'standard'),
    GREATEST(COALESCE(p_distance_km, 0), 0), GREATEST(COALESCE(p_estimated_minutes, 60), 0),
    COALESCE(p_dropoff_mode, 'runner_delivers'::dropoff_mode),
    NULLIF(trim(COALESCE(p_third_party, '')), ''),
    COALESCE(p_fund_mode, 'customer_advance'::fund_mode),
    (v_devis->>'serviceFee')::numeric, v_rule.rate, (v_devis->>'commission')::numeric,
    (v_devis->>'runnerPayout')::numeric,
    COALESCE(p_budget_estimate, 0) + (v_devis->>'serviceFee')::numeric,
    public.generate_handover_code(),
    -- Le barème appliqué est celui du jour de la publication, et il ne bougera
    -- plus : c'est celui que le client a vu au moment de s'engager.
    v_rule.id,
    (v_devis->>'ruleId')::uuid
  )
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(v_errand.id, 'open'::errand_status, 'Course publiée');

  RETURN v_errand;
END;
$$;

-- La nouvelle colonne doit être lisible par le client : il a le droit de savoir
-- quelle grille a chiffré sa course. Le grant est recalculé colonne par colonne.
SELECT public.refresh_errand_column_grants();

-- ---------------------------------------------------------------------------
-- 8. Publier un barème
--
-- Un tarif ne se modifie pas : il se republie. La version en cours est figée,
-- une nouvelle prend la suite, et les courses déjà publiées gardent la leur.
-- Corriger une ligne en place réécrirait le prix de courses déjà engagées.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pricing_publish(
  p_label     text,
  p_scalaires jsonb,   -- minutes offertes, prix minute, volumes, urgences, remises
  p_vehicules jsonb,   -- { "moto": {"base": 700, "perKm": 130}, ... }
  p_villes    jsonb    -- { "abidjan": {"baseMultiplier": 1, "perKmMultiplier": 1}, ... }
)
RETURNS public.pricing_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_version integer;
  v_regle   public.pricing_rules;
  v_cle     text;
  v_val     jsonb;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Seul un administrateur peut publier un barème.' USING ERRCODE = '42501';
  END IF;

  IF coalesce(char_length(trim(COALESCE(p_label, ''))), 0) < 3 THEN
    RAISE EXCEPTION 'Donnez un intitulé au barème : il sert à le reconnaître.' USING ERRCODE = '22023';
  END IF;

  -- Un barème sans grille de véhicules ne peut rien chiffrer.
  IF p_vehicules IS NULL OR NOT (p_vehicules ? 'any') THEN
    RAISE EXCEPTION 'La grille doit au moins définir le véhicule « any ».' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO v_version FROM public.pricing_rules;

  UPDATE public.pricing_rules SET is_active = false WHERE is_active;

  INSERT INTO public.pricing_rules (
    version, label, free_minutes, per_minute, items_included, per_extra_item,
    volume_small, volume_medium, volume_large, volume_xl,
    urgency_scheduled, urgency_standard, urgency_express,
    dropoff_runner, dropoff_third, dropoff_pickup, rounding_step,
    is_active, created_by
  ) VALUES (
    v_version, trim(p_label),
    COALESCE((p_scalaires->>'freeMinutes')::integer, 30),
    COALESCE((p_scalaires->>'perMinute')::numeric, 10),
    COALESCE((p_scalaires->>'itemsIncluded')::integer, 10),
    COALESCE((p_scalaires->>'perExtraItem')::numeric, 50),
    COALESCE((p_scalaires#>>'{volume,small}')::numeric, 0),
    COALESCE((p_scalaires#>>'{volume,medium}')::numeric, 500),
    COALESCE((p_scalaires#>>'{volume,large}')::numeric, 1500),
    COALESCE((p_scalaires#>>'{volume,xl}')::numeric, 3000),
    COALESCE((p_scalaires#>>'{urgency,scheduled}')::numeric, 0),
    COALESCE((p_scalaires#>>'{urgency,standard}')::numeric, 0),
    COALESCE((p_scalaires#>>'{urgency,express}')::numeric, 1000),
    COALESCE((p_scalaires#>>'{dropoff,runner_delivers}')::numeric, 0),
    COALESCE((p_scalaires#>>'{dropoff,third_party}')::numeric, -300),
    COALESCE((p_scalaires#>>'{dropoff,customer_pickup}')::numeric, -500),
    COALESCE((p_scalaires->>'roundingStep')::integer, 50),
    true, v_uid
  ) RETURNING * INTO v_regle;

  FOR v_cle, v_val IN SELECT * FROM jsonb_each(p_vehicules) LOOP
    INSERT INTO public.pricing_vehicle_rates (rule_id, vehicle, base, per_km)
    VALUES (v_regle.id, v_cle, (v_val->>'base')::numeric, (v_val->>'perKm')::numeric);
  END LOOP;

  -- Une ville inconnue du référentiel est refusée par la clé étrangère : mieux
  -- vaut un échec de publication qu'un coefficient qui ne s'appliquera jamais.
  FOR v_cle, v_val IN SELECT * FROM jsonb_each(COALESCE(p_villes, '{}'::jsonb)) LOOP
    INSERT INTO public.pricing_city_rates
      (rule_id, city_slug, base_multiplier, per_km_multiplier, min_service_fee)
    VALUES (
      v_regle.id, v_cle,
      COALESCE((v_val->>'baseMultiplier')::numeric, 1),
      COALESCE((v_val->>'perKmMultiplier')::numeric, 1),
      NULLIF(v_val->>'minServiceFee', '')::numeric
    );
  END LOOP;

  PERFORM public.log_audit('pricing_publish', 'pricing_rules', v_regle.id::text,
    jsonb_build_object('version', v_version, 'label', trim(p_label),
                       'vehicules', p_vehicules, 'villes', p_villes));

  RETURN v_regle;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Qui voit quoi
--
-- Le barème est public en lecture : un client a le droit de savoir sur quelle
-- grille son devis repose, et un shopper de vérifier ce qui lui revient. Rien
-- n'y est confidentiel. L'écriture passe exclusivement par pricing_publish.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pricing_rules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_vehicle_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_city_rates    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Bareme lisible" ON public.pricing_rules;
CREATE POLICY "Bareme lisible" ON public.pricing_rules
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Grille vehicules lisible" ON public.pricing_vehicle_rates;
CREATE POLICY "Grille vehicules lisible" ON public.pricing_vehicle_rates
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Grille villes lisible" ON public.pricing_city_rates;
CREATE POLICY "Grille villes lisible" ON public.pricing_city_rates
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.pricing_rules,        public.pricing_vehicle_rates,
              public.pricing_city_rates FROM anon, authenticated;
GRANT SELECT ON public.pricing_rules,      public.pricing_vehicle_rates,
              public.pricing_city_rates TO anon, authenticated;
GRANT ALL    ON public.pricing_rules,      public.pricing_vehicle_rates,
              public.pricing_city_rates TO service_role;

-- La table appartient au propriétaire du schéma, qui contourne RLS. Forcer la
-- politique referme ce contournement pour les écritures applicatives.
ALTER TABLE public.pricing_rules        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_vehicle_rates FORCE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_city_rates    FORCE ROW LEVEL SECURITY;

REVOKE ALL ON FUNCTION public.pricing_publish(text, jsonb, jsonb, jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pricing_publish(text, jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.active_pricing_grid() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pricing_quote(text, text, text, text, text, numeric, integer, integer)
  TO anon, authenticated;
