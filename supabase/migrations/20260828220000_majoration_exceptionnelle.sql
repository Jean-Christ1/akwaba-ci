-- La majoration exceptionnelle, et à qui elle revient.
--
-- Un soir de pluie à Abidjan, personne ne veut sortir. Les courses s'accumulent
-- et aucun shopper ne les prend. La plateforme n'avait aucun moyen de changer
-- cela : le barème est le même à quinze heures et à vingt-deux heures un jour
-- d'orage, et un shopper n'a aucune raison de préférer le second.
--
-- La majoration répond à cela, et elle pose immédiatement une question de fond
-- que la plupart des plateformes tranchent mal : à qui revient le supplément ?
--
-- Ici il revient entièrement au shopper. La commission d'Akwaba se calcule sur
-- le tarif d'avant majoration, pas après. La raison est simple : la majoration
-- existe pour convaincre quelqu'un de sortir sous la pluie. La faire passer en
-- partie par la commission reviendrait à s'enrichir d'une pénurie, ce qui n'est
-- pas un service, c'est une rente.
--
-- Trois garde-fous, parce qu'une majoration est un outil qui se retourne vite.
--
-- Elle est plafonnée. Doubler est un maximum absolu, écrit dans la contrainte
-- de la table et non dans le code : un chiffre saisi de travers ne peut pas
-- tripler un prix.
--
-- Elle a toujours un motif écrit, et ce motif est montré au client avant qu'il
-- ne commande. Un supplément qu'on découvre après coup n'est pas un prix, c'est
-- une surprise.
--
-- Elle a toujours une fin. Une majoration sans terme est une hausse de tarif
-- déguisée, et elle mérite alors de passer par le barème, où elle se voit.

CREATE TABLE IF NOT EXISTS public.pricing_surges (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- NULL : la majoration vaut partout. Sinon, une seule ville.
  city_slug  text REFERENCES public.service_cities(slug) ON DELETE CASCADE,
  multiplicateur numeric(4, 2) NOT NULL CHECK (multiplicateur > 1 AND multiplicateur <= 2),
  motif      text NOT NULL CHECK (char_length(btrim(motif)) >= 10),
  debut      timestamptz NOT NULL DEFAULT now(),
  fin        timestamptz NOT NULL,
  actif      boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (fin > debut)
);

CREATE INDEX IF NOT EXISTS pricing_surges_en_cours
  ON public.pricing_surges (city_slug, debut, fin) WHERE actif;

COMMENT ON TABLE public.pricing_surges IS
  'Majorations exceptionnelles. Le supplement revient entierement au shopper : la commission se calcule sur le tarif d''avant majoration.';

-- ---------------------------------------------------------------------------
-- Une seule majoration à la fois pour un même endroit
--
-- Deux majorations qui se chevauchent poseraient une question sans réponse :
-- laquelle s'applique ? Choisir la plus forte encouragerait à en empiler, la
-- plus récente rendrait la première invisible. Mieux vaut l'interdire.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_surge_sans_chevauchement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.actif AND EXISTS (
    SELECT 1 FROM public.pricing_surges s
     WHERE s.id IS DISTINCT FROM NEW.id
       AND s.actif
       AND s.fin > now()
       AND (s.city_slug IS NOT DISTINCT FROM NEW.city_slug
            OR s.city_slug IS NULL OR NEW.city_slug IS NULL)
       AND tstzrange(s.debut, s.fin) && tstzrange(NEW.debut, NEW.fin)
  ) THEN
    RAISE EXCEPTION 'Une majoration couvre déjà cette période ici. Arrêtez-la avant d''en ouvrir une autre.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_surge_sans_chevauchement ON public.pricing_surges;
CREATE TRIGGER guard_surge_sans_chevauchement
  BEFORE INSERT OR UPDATE ON public.pricing_surges
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_surge_sans_chevauchement();

-- ---------------------------------------------------------------------------
-- La majoration en vigueur ici, maintenant
--
-- La ville se reconnaît par son identifiant ou par son nom, comme partout
-- ailleurs : c'est le piège qui s'est déjà refermé quatre fois dans ce dépôt.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.surge_en_vigueur(p_city text DEFAULT NULL)
RETURNS TABLE (
  id             uuid,
  multiplicateur numeric,
  motif          text,
  fin            timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT s.id, s.multiplicateur, s.motif, s.fin
    FROM public.pricing_surges s
   WHERE s.actif
     AND s.debut <= now() AND s.fin > now()
     AND (s.city_slug IS NULL OR public.meme_ville(s.city_slug, p_city))
   -- La plus forte l'emporte si une majoration nationale et une majoration de
   -- ville se rencontrent : c'est celle qui décrit la situation la plus dure.
   ORDER BY s.multiplicateur DESC
   LIMIT 1;
$fn$;

REVOKE ALL ON FUNCTION public.surge_en_vigueur(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.surge_en_vigueur(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Le devis, majoration comprise et annoncée
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pricing_quote(
  p_city text, p_vehicle text, p_volume text, p_urgency text, p_dropoff text,
  p_distance_km numeric, p_minutes integer, p_items_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r            public.pricing_rules;
  v_veh        public.pricing_vehicle_rates;
  v_city       public.pricing_city_rates;
  k            public.commission_rules;
  v_surge      record;
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
  v_avant      numeric(12,2);
  v_majoration numeric(12,2);
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

  SELECT * INTO v_veh FROM public.pricing_vehicle_rates
   WHERE rule_id = r.id AND vehicle = COALESCE(p_vehicle, 'any');
  IF v_veh.rule_id IS NULL THEN
    SELECT * INTO v_veh FROM public.pricing_vehicle_rates
     WHERE rule_id = r.id AND vehicle = 'any';
  END IF;

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
  v_avant    := GREATEST(round(v_brut / r.rounding_step) * r.rounding_step, v_plancher);

  SELECT * INTO v_surge FROM public.surge_en_vigueur(p_city);

  -- La majoration s'ajoute au tarif arrondi, et elle s'arrondit au même pas :
  -- un supplément de 137 francs sur un prix qui va de cent en cent donnerait un
  -- total qu'on ne saurait pas lire.
  v_majoration := CASE
    WHEN v_surge.multiplicateur IS NULL THEN 0
    ELSE round(v_avant * (v_surge.multiplicateur - 1) / r.rounding_step) * r.rounding_step
  END;

  v_service := v_avant + v_majoration;

  -- La commission se calcule sur le tarif d'avant majoration. Le supplément
  -- revient entierement au shopper : il existe pour le convaincre de sortir,
  -- pas pour enrichir la plateforme d'une penurie.
  v_commission := round(v_avant * k.rate, 2);

  RETURN jsonb_build_object(
    'ruleId', r.id, 'version', r.version,
    'base', v_base, 'distanceFee', v_distfee, 'timeFee', v_timefee,
    'volumeFee', v_volfee, 'urgencyFee', v_urgfee, 'itemsFee', v_itemfee,
    'dropoffAdjustment', v_dropadj,
    'raw', v_brut, 'minServiceFee', v_plancher,
    'serviceFeeBeforeSurge', v_avant,
    'surgeMultiplier', COALESCE(v_surge.multiplicateur, 1),
    'surgeFee', v_majoration,
    'surgeReason', v_surge.motif,
    'surgeUntil', v_surge.fin,
    'serviceFee', v_service, 'commissionRate', k.rate,
    'commission', v_commission, 'runnerPayout', v_service - v_commission
  );
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Ouvrir et arrêter une majoration
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, ne_permet_pas, sensible, portee, position)
VALUES ('majoration.publier', 'Finances', 'Ouvrir une majoration exceptionnelle',
        'Majorer temporairement les frais de service dans une ville, avec un motif et une fin.',
        'Ne change pas le prix des courses déjà publiées, ne dépasse jamais le double, et n''augmente pas la commission d''Akwaba : le supplément revient au shopper.',
        true, 'ville', 118)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, ne_permet_pas = EXCLUDED.ne_permet_pas,
  sensible = EXCLUDED.sensible, portee = EXCLUDED.portee, position = EXCLUDED.position;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'majoration.publier'),
  ('admin_plateforme', 'majoration.publier'),
  ('admin_operations', 'majoration.publier')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.surge_ouvrir(
  p_multiplicateur numeric,
  p_motif          text,
  p_minutes        integer DEFAULT 120,
  p_city_slug      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
  v_id  uuid;
BEGIN
  IF NOT public.has_scoped_permission(v_moi, 'majoration.publier', p_city_slug) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''ouvrir une majoration ici.'
      USING ERRCODE = '42501';
  END IF;

  IF p_minutes IS NULL OR p_minutes < 15 OR p_minutes > 24 * 60 THEN
    RAISE EXCEPTION 'Une majoration dure entre quinze minutes et vingt-quatre heures.'
      USING ERRCODE = '22023';
  END IF;

  IF p_city_slug IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.service_cities WHERE slug = p_city_slug) THEN
    RAISE EXCEPTION 'Ville inconnue : %.', p_city_slug USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.pricing_surges (city_slug, multiplicateur, motif, fin, created_by)
  VALUES (p_city_slug, p_multiplicateur, btrim(p_motif),
          now() + make_interval(mins => p_minutes), v_moi)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'surge_ouvrir', 'pricing_surge', v_id::text,
          jsonb_build_object('multiplicateur', p_multiplicateur, 'ville', p_city_slug,
                             'minutes', p_minutes, 'motif', btrim(p_motif)));

  RETURN jsonb_build_object('id', v_id, 'multiplicateur', p_multiplicateur,
                            'fin', now() + make_interval(mins => p_minutes));
END;
$fn$;

REVOKE ALL ON FUNCTION public.surge_ouvrir(numeric, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.surge_ouvrir(numeric, text, integer, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.surge_arreter(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi   uuid := auth.uid();
  v_surge public.pricing_surges;
BEGIN
  SELECT * INTO v_surge FROM public.pricing_surges WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Majoration introuvable.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.has_scoped_permission(v_moi, 'majoration.publier', v_surge.city_slug) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''arrêter cette majoration.'
      USING ERRCODE = '42501';
  END IF;

  -- On ne l'efface pas : les courses publiées pendant qu'elle courait portent
  -- son prix, et le motif de ce prix doit rester consultable.
  UPDATE public.pricing_surges SET actif = false, fin = LEAST(fin, now()) WHERE id = p_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'surge_arreter', 'pricing_surge', p_id::text,
          jsonb_build_object('ville', v_surge.city_slug,
                             'multiplicateur', v_surge.multiplicateur));

  RETURN jsonb_build_object('id', p_id, 'actif', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.surge_arreter(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.surge_arreter(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Qui voit quoi
--
-- Le client doit voir la majoration en cours avant de commander : un supplément
-- découvert après coup n'est pas un prix. L'historique, lui, appartient à
-- l'exploitation.
-- ---------------------------------------------------------------------------

ALTER TABLE public.pricing_surges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pricing_surges FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Majorations en cours lisibles" ON public.pricing_surges;
CREATE POLICY "Majorations en cours lisibles" ON public.pricing_surges
  FOR SELECT TO anon, authenticated
  USING (
    (actif AND fin > now())
    OR public.has_permission(auth.uid(), 'majoration.publier')
    OR public.has_permission(auth.uid(), 'bareme.publier')
  );

REVOKE ALL ON public.pricing_surges FROM anon, authenticated;
GRANT SELECT ON public.pricing_surges TO anon, authenticated;
GRANT ALL ON public.pricing_surges TO service_role;
