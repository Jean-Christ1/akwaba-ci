-- Les droits fins commandent réellement les décisions.
--
-- La migration précédente a posé un catalogue de droits, des rôles et une
-- matrice. Rien ne s'en servait : les fonctions continuaient de demander
-- « est-ce un admin ou un modérateur ? ». Une matrice que personne n'interroge
-- décrit une intention, pas un contrôle.
--
-- Les décisions les plus lourdes passent ici sous le régime des droits :
-- publier un barème, valider un shopper, suspendre un shopper. Ce sont celles
-- qui déplacent de l'argent ou qui engagent la plateforme sur l'identité de
-- quelqu'un.
--
-- Compatibilité : has_permission répond vrai pour le rôle hérité « admin », et
-- le rôle hérité « moderator » reçoit ci-dessous un rôle d'exploitation qui
-- reproduit exactement ce qu'il pouvait déjà faire. Personne ne perd un accès
-- qu'il avait hier.

INSERT INTO public.staff_roles (code, libelle, description, systeme, position) VALUES
  ('moderateur', 'Moderateur',
   'Perimetre historique du role moderator : courses, litiges, dossiers de shopper, lieux.',
   true, 25)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle, description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('moderateur', 'utilisateurs.lire'),
  ('moderateur', 'shoppers.lire'),
  ('moderateur', 'shoppers.identite.lire'),
  ('moderateur', 'shoppers.valider'),
  ('moderateur', 'shoppers.suspendre'),
  ('moderateur', 'courses.lire'),
  ('moderateur', 'courses.deverrouiller'),
  ('moderateur', 'courses.corriger'),
  ('moderateur', 'litiges.lire'),
  ('moderateur', 'litiges.trancher'),
  ('moderateur', 'paiements.lire'),
  ('moderateur', 'commissions.encaisser'),
  ('moderateur', 'lieux.lire'),
  ('moderateur', 'lieux.moderer'),
  ('moderateur', 'organisations.lire'),
  ('moderateur', 'exploitation.sante'),
  ('moderateur', 'audit.lire')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Le rôle hérité porte le rôle d'exploitation correspondant
--
-- Le faire par attribution plutôt que par un cas particulier dans
-- has_permission garde une seule règle de résolution, et rend l'héritage
-- visible dans la console au lieu de le cacher dans une fonction.
-- ---------------------------------------------------------------------------

INSERT INTO public.staff_assignments (user_id, role_code)
SELECT user_id, 'moderateur' FROM public.user_roles WHERE role = 'moderator'::app_role
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_legacy_staff_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Un moderateur nomme plus tard doit recevoir le meme perimetre sans qu'on
  -- ait a y penser.
  IF NEW.role = 'moderator'::app_role THEN
    INSERT INTO public.staff_assignments (user_id, role_code)
    VALUES (NEW.user_id, 'moderateur') ON CONFLICT DO NOTHING;
  ELSIF NEW.role = 'admin'::app_role THEN
    INSERT INTO public.staff_assignments (user_id, role_code)
    VALUES (NEW.user_id, 'super_admin') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS sync_legacy_staff_role ON public.user_roles;
CREATE TRIGGER sync_legacy_staff_role
  AFTER INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.sync_legacy_staff_role();

-- ---------------------------------------------------------------------------
-- Publier un barème demande le droit de publier un barème
--
-- Seule la garde change ; le reste de la fonction est repris à l'identique,
-- sans quoi une republication écrirait autre chose.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pricing_publish(
  p_label     text,
  p_scalaires jsonb,
  p_vehicules jsonb,
  p_villes    jsonb
)
RETURNS public.pricing_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_version integer;
  v_regle   public.pricing_rules;
  v_cle     text;
  v_val     jsonb;
BEGIN
  IF NOT public.has_permission(v_uid, 'bareme.publier') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de publier un bareme.' USING ERRCODE = '42501';
  END IF;

  IF coalesce(char_length(trim(COALESCE(p_label, ''))), 0) < 3 THEN
    RAISE EXCEPTION 'Donnez un intitule au bareme : il sert a le reconnaitre.' USING ERRCODE = '22023';
  END IF;

  IF p_vehicules IS NULL OR NOT (p_vehicules ? 'any') THEN
    RAISE EXCEPTION 'La grille doit au moins definir le vehicule « any ».' USING ERRCODE = '22023';
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

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'pricing_publish', 'pricing_rules', v_regle.id::text,
          jsonb_build_object('version', v_version, 'label', trim(p_label),
                             'vehicules', p_vehicules, 'villes', p_villes));

  RETURN v_regle;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Valider ou suspendre un shopper demande le droit correspondant
--
-- La distinction compte : valider engage la plateforme sur une identité,
-- suspendre prive quelqu'un de son revenu. Ce ne sont pas les mêmes gestes, et
-- rien n'oblige à ce que la même personne porte les deux.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_set_status(
  p_runner_id uuid,
  p_status    runner_status,
  p_reason    text DEFAULT NULL
)
RETURNS public.runner_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi     uuid := auth.uid();
  v_avant   public.runner_profiles;
  v_apres   public.runner_profiles;
  v_manques text[];
  v_droit   text;
BEGIN
  v_droit := CASE p_status
    WHEN 'approved'::runner_status  THEN 'shoppers.valider'
    WHEN 'rejected'::runner_status  THEN 'shoppers.valider'
    ELSE 'shoppers.suspendre'
  END;

  IF NOT public.has_permission(v_moi, v_droit) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de prendre cette decision sur un shopper.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_avant FROM public.runner_profiles WHERE id = p_runner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dossier de shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_avant.status = p_status THEN
    -- Rien ne change : ne pas inscrire une décision qui n'a pas eu lieu.
    RETURN v_avant;
  END IF;

  -- Suspendre ou refuser prive quelqu'un de son revenu : le motif est exigé,
  -- alors qu'une validation se suffit à elle-même.
  IF p_status IN ('suspended'::runner_status, 'rejected'::runner_status)
     AND char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de la suspension ou du refus.' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'approved'::runner_status THEN
    v_manques := public.runner_identity_gaps(v_avant);
    IF array_length(v_manques, 1) > 0 THEN
      RAISE EXCEPTION 'Ce dossier ne peut pas encore etre valide. Il manque : %.',
        array_to_string(v_manques, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.runner_profiles
  SET status = p_status,
      identity_reviewed_at = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN now() ELSE identity_reviewed_at END,
      identity_reviewed_by = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN v_moi ELSE identity_reviewed_by END,
      identity_review_note = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN NULLIF(btrim(COALESCE(p_reason, '')), '') ELSE identity_review_note END
  WHERE id = p_runner_id
  RETURNING * INTO v_apres;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'set_status', 'runner_profile', p_runner_id::text,
          jsonb_build_object(
            'avant', v_avant.status,
            'apres', p_status,
            'droit', v_droit,
            'motif', COALESCE(NULLIF(btrim(p_reason), ''), 'non precise')));

  RETURN v_apres;
END;
$fn$;
