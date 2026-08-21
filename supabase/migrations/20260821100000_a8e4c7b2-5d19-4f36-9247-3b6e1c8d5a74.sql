-- ---------------------------------------------------------------------------
-- Une course ne se publie plus dans une ville fermée.
--
-- Sept villes sur huit sont fermées aux courses : le réseau de shoppers n'y
-- existe pas encore. L'écran de demande les filtre déjà, il ne propose que les
-- villes ouvertes. Mais rien ne le vérifie côté serveur.
--
-- Ce que cela permet, très concrètement : la politique d'insertion laisse un
-- client écrire directement dans la table, sans passer par la fonction de
-- création. Une requête directe, un client tiers, une application mobile
-- future, un ancien onglet resté ouvert avec une ville depuis fermée, et la
-- course part dans une ville que personne ne dessert. Elle est publiée, le
-- client attend, et aucun shopper ne la verra jamais.
--
-- La garde est un déclencheur plutôt qu'un contrôle ajouté dans la fonction de
-- création : elle couvre alors les deux chemins, l'appel de fonction et
-- l'écriture directe, au lieu du seul premier.
--
-- Le personnel garde la main : ouvrir une course dans une ville en cours
-- d'ouverture fait partie de son métier.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_city_open()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ouverte boolean;
BEGIN
  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RETURN NEW;
  END IF;

  -- La ville est reconnue par son nom ou par son identifiant court : le
  -- formulaire envoie le nom, d'autres chemins pourraient envoyer le second.
  SELECT errands_enabled
  INTO v_ouverte
  FROM public.service_cities
  WHERE name = NEW.city OR slug = NEW.city
  LIMIT 1;

  IF v_ouverte IS NULL THEN
    RAISE EXCEPTION 'La ville « % » ne fait pas partie des villes desservies.', NEW.city
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_ouverte THEN
    RAISE EXCEPTION 'Le service de courses n''est pas encore ouvert à %. Choisissez une ville desservie.', NEW.city
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.guard_errand_city_open() IS
  'Refuse une course dans une ville inconnue ou fermée aux courses. Couvre l''appel de fonction comme l''écriture directe.';

DROP TRIGGER IF EXISTS trg_errand_city_open ON public.errands;
CREATE TRIGGER trg_errand_city_open
  BEFORE INSERT ON public.errands
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_errand_city_open();

-- ---------------------------------------------------------------------------
-- Publier un barème ne renverse plus le mode de règlement.
--
-- La fonction reprend déjà du barème précédent le plafond de pourboire et
-- celui de la livraison, avec le motif écrit noir sur blanc : « une console qui
-- ne les expose pas encore ne doit pas les réinitialiser à son insu ».
--
-- Le mode de règlement a été oublié de ce même raisonnement. Il n'est jamais
-- écrit, donc il retombe sur la valeur par défaut de la colonne, « direct ».
-- Aujourd'hui le barème vivant est déjà en direct, donc rien ne se voit. Mais
-- le jour où la plateforme passe au séquestre, la première grille publiée
-- depuis la console la ramènerait au direct sans un mot : la plateforme
-- cesserait de détenir les fonds, et personne ne l'apprendrait avant de
-- chercher pourquoi les soldes des shoppers ne bougent plus.
--
-- Le mode se reprend donc comme les plafonds, et devient modifiable
-- explicitement quand on le veut vraiment.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commission_rule_publish(
  p_rate numeric,
  p_min_service_fee numeric,
  p_min_payout numeric,
  p_hold_hours integer,
  p_overtime_grace integer,
  p_overtime_per_min numeric,
  p_distance_grace_km numeric,
  p_distance_per_km numeric,
  p_overrun_cap_ratio numeric,
  p_budget_tol_pct numeric,
  p_budget_tol_min numeric,
  p_settlement public.settlement_mode DEFAULT NULL
)
RETURNS public.commission_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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

  -- Les plafonds du pourboire et de la livraison, l'assiette de la commission
  -- et le mode de règlement sont repris du barème précédent : une console qui
  -- ne les expose pas encore ne doit pas les réinitialiser à son insu.
  INSERT INTO public.commission_rules (
    version, rate, base, settlement, min_service_fee, min_payout, hold_hours, is_active,
    overtime_grace_minutes, overtime_per_minute, distance_grace_km,
    distance_per_km, overrun_cap_ratio, budget_tolerance_pct, budget_tolerance_min,
    tip_cap, delivery_fee_cap
  ) VALUES (
    v_version, p_rate,
    COALESCE(v_ancien.base, 'service_and_delivery'),
    COALESCE(p_settlement, v_ancien.settlement, 'direct'::settlement_mode),
    p_min_service_fee, p_min_payout,
    p_hold_hours, true,
    p_overtime_grace, p_overtime_per_min, p_distance_grace_km,
    p_distance_per_km, p_overrun_cap_ratio, p_budget_tol_pct, p_budget_tol_min,
    COALESCE(v_ancien.tip_cap, 20000), COALESCE(v_ancien.delivery_fee_cap, 5000)
  )
  RETURNING * INTO v_regle;

  PERFORM public.log_audit('publish', 'commission_rule', v_version::text,
    jsonb_build_object('rate', p_rate, 'min_payout', p_min_payout,
                       'settlement', v_regle.settlement, 'base', v_regle.base));

  RETURN v_regle;
END;
$fn$;

-- L'ancienne signature disparaît : deux surcharges dont l'une a un paramètre
-- par défaut rendraient l'appel ambigu, exactement le piège déjà rencontré sur
-- la réouverture de remise.
DROP FUNCTION IF EXISTS public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric
);

DO $$
DECLARE
  v_nombre integer;
BEGIN
  SELECT count(*) INTO v_nombre
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'commission_rule_publish';

  IF v_nombre <> 1 THEN
    RAISE EXCEPTION 'La publication de barème doit avoir exactement une signature, % trouvée(s).', v_nombre;
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, public.settlement_mode
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commission_rule_publish(
  numeric, numeric, numeric, integer, integer, numeric, numeric, numeric, numeric, numeric, numeric, public.settlement_mode
) TO authenticated;
