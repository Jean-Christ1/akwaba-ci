-- Le moteur des codes promotionnels.
--
-- Une seule fonction décide, et elle rend toujours une raison. Un code refusé
-- sans explication envoie le client au support pour une réponse qu'on aurait
-- pu lui donner tout de suite : périmé, épuisé, réservé à une autre ville, ou
-- déjà utilisé par lui.

CREATE OR REPLACE FUNCTION public.promo_evaluer(
  p_code       text,
  p_user_id    uuid,
  p_ville      text,
  p_frais      numeric,
  p_commission numeric,
  -- La course en cours d'evaluation, quand elle existe deja : sans elle, son
  -- propre usage compterait contre elle au moment de recalculer son prix.
  p_errand_id  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_promo   public.promo_codes;
  v_code    text := upper(btrim(COALESCE(p_code, '')));
  v_usages  integer;
  v_siens   integer;
  v_brute   numeric(12,2);
  v_remise  numeric(12,2);
BEGIN
  IF v_code = '' THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0, 'motif', 'aucun code');
  END IF;

  SELECT * INTO v_promo FROM public.promo_codes WHERE code = v_code;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', 'Ce code n''existe pas.');
  END IF;

  IF NOT v_promo.actif THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', 'Ce code n''est plus actif.');
  END IF;

  IF now() < v_promo.debut THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', 'Ce code n''est pas encore utilisable.');
  END IF;

  IF v_promo.fin IS NOT NULL AND now() > v_promo.fin THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', 'Ce code a expiré.');
  END IF;

  -- La course enregistre la ville par son nom, le referentiel par son
  -- identifiant : on accepte les deux, comme le fait le bareme tarifaire.
  IF v_promo.ville_slug IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.service_cities s
       WHERE s.slug = v_promo.ville_slug
         AND (s.slug = p_ville OR lower(s.name) = lower(COALESCE(p_ville, '')))
    ) THEN
      RETURN jsonb_build_object('valide', false, 'remise', 0,
        'motif', 'Ce code ne s''applique pas dans cette ville.');
    END IF;
  END IF;

  IF COALESCE(p_frais, 0) < v_promo.frais_minimum THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', format('Ce code demande au moins %s FCFA de frais de service.',
                      trunc(v_promo.frais_minimum)));
  END IF;

  IF v_promo.usages_max IS NOT NULL THEN
    SELECT count(*) INTO v_usages FROM public.promo_redemptions r
     WHERE r.code = v_code AND (p_errand_id IS NULL OR r.errand_id <> p_errand_id);
    IF v_usages >= v_promo.usages_max THEN
      RETURN jsonb_build_object('valide', false, 'remise', 0,
        'motif', 'Ce code a atteint sa limite d''utilisation.');
    END IF;
  END IF;

  IF p_user_id IS NOT NULL THEN
    SELECT count(*) INTO v_siens FROM public.promo_redemptions r
     WHERE r.code = v_code AND r.user_id = p_user_id
       AND (p_errand_id IS NULL OR r.errand_id <> p_errand_id);
    IF v_siens >= v_promo.usages_par_personne THEN
      RETURN jsonb_build_object('valide', false, 'remise', 0,
        'motif', 'Vous avez déjà utilisé ce code.');
    END IF;
  END IF;

  v_brute := CASE v_promo.type
    WHEN 'percent' THEN round(COALESCE(p_frais, 0) * v_promo.valeur / 100, 2)
    ELSE v_promo.valeur
  END;

  IF v_promo.remise_max IS NOT NULL THEN
    v_brute := LEAST(v_brute, v_promo.remise_max);
  END IF;

  -- La regle qui compte. La remise sort de la commission de la plateforme, et
  -- de rien d'autre. Un shopper n'a pas decide de la promotion, ne l'a pas
  -- annoncee, ne l'a meme pas vue : lui en faire porter le cout reduirait son
  -- revenu pour une decision commerciale qui n'est pas la sienne, et il n'en
  -- saurait rien. Il verrait seulement une course moins bien payee.
  v_remise := LEAST(v_brute, GREATEST(COALESCE(p_commission, 0), 0));
  v_remise := LEAST(v_remise, COALESCE(p_frais, 0));

  IF v_remise <= 0 THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', 'Ce code ne peut rien offrir sur cette course.');
  END IF;

  RETURN jsonb_build_object(
    'valide', true,
    'code', v_code,
    'libelle', v_promo.libelle,
    'remise', v_remise,
    'remise_theorique', v_brute,
    -- Vrai quand la commission a limite la remise : la console doit pouvoir
    -- expliquer pourquoi le client a eu moins que la valeur annoncee.
    'plafonnee_par_commission', v_brute > v_remise,
    'motif', NULL
  );
END;
$fn$;

COMMENT ON FUNCTION public.promo_evaluer(text, uuid, text, numeric, numeric, uuid) IS
  'Evalue un code promo et rend la remise applicable, plafonnee a la commission de la plateforme.';

-- ---------------------------------------------------------------------------
-- Appliquer un code à une course
--
-- Séparé de l'évaluation : l'évaluation se fait à chaque frappe dans le
-- formulaire, l'application une seule fois, quand le prix est arrêté.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promo_appliquer(
  p_errand_id uuid,
  p_code      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_errand public.errands;
  v_brute  numeric(12,2);
  v_eval   jsonb;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0, 'motif', 'Course introuvable.');
  END IF;

  -- Seul le client de la course y pose un code, et seulement tant qu'elle est
  -- ouverte. Apres l'acceptation d'une offre, les montants sont engages avec
  -- un shopper : les changer sous lui reviendrait a modifier son contrat.
  IF v_errand.customer_id IS DISTINCT FROM auth.uid()
     AND NOT public.has_permission(auth.uid(), 'promotions.gerer') THEN
    RAISE EXCEPTION 'Seul le client de la course peut y appliquer un code.'
      USING ERRCODE = '42501';
  END IF;

  IF v_errand.status <> 'open'::errand_status
     AND NOT public.has_permission(auth.uid(), 'promotions.gerer') THEN
    RETURN jsonb_build_object('valide', false, 'remise', 0,
      'motif', 'Cette course n''est plus ouverte : le code ne peut plus y etre applique.');
  END IF;

  -- La commission stockee est nette : elle a deja pu absorber une remise. On
  -- evalue sur la commission BRUTE, recalculee depuis les frais et le taux,
  -- sinon appliquer un code deux fois le retrancherait deux fois.
  v_brute := round(COALESCE(v_errand.service_fee, 0) * COALESCE(v_errand.commission_rate, 0), 2);

  v_eval := public.promo_evaluer(
    p_code, v_errand.customer_id, v_errand.city,
    COALESCE(v_errand.service_fee, 0), v_brute, p_errand_id
  );

  IF NOT (v_eval->>'valide')::boolean THEN
    RETURN v_eval;
  END IF;

  -- On ne pose que le code. Le declencheur promo_recalculer en tire la remise,
  -- la commission nette et le total, a partir des montants bruts. Un seul
  -- endroit calcule, donc un seul endroit peut se tromper.
  PERFORM set_config('app.errand_engine', 'on', true);
  UPDATE public.errands SET promo_code = v_eval->>'code' WHERE id = p_errand_id;
  PERFORM set_config('app.errand_engine', 'off', true);

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id;

  INSERT INTO public.promo_redemptions (code, errand_id, user_id, remise)
  VALUES (v_eval->>'code', p_errand_id, v_errand.customer_id,
          COALESCE(v_errand.promo_discount, 0))
  ON CONFLICT (errand_id) DO UPDATE SET
    code = EXCLUDED.code, remise = EXCLUDED.remise;

  RETURN jsonb_set(v_eval, '{remise}',
                   to_jsonb(COALESCE(v_errand.promo_discount, 0)));
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Publier un code
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promo_publier(
  p_code            text,
  p_libelle         text,
  p_type            text,
  p_valeur          numeric,
  p_remise_max      numeric DEFAULT NULL,
  p_frais_minimum   numeric DEFAULT 0,
  p_ville_slug      text DEFAULT NULL,
  p_fin             timestamptz DEFAULT NULL,
  p_usages_max      integer DEFAULT NULL,
  p_usages_par_personne integer DEFAULT 1,
  p_actif           boolean DEFAULT true
)
RETURNS public.promo_codes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_promo public.promo_codes;
  v_code  text := upper(btrim(COALESCE(p_code, '')));
BEGIN
  IF NOT public.has_permission(v_uid, 'promotions.gerer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de gérer les codes promotionnels.'
      USING ERRCODE = '42501';
  END IF;

  IF v_code !~ '^[A-Z0-9-]{3,24}$' THEN
    RAISE EXCEPTION 'Un code ne contient que des majuscules, des chiffres et des tirets, de trois à vingt-quatre caractères.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.promo_codes (
    code, libelle, type, valeur, remise_max, frais_minimum, ville_slug,
    fin, usages_max, usages_par_personne, actif, created_by
  ) VALUES (
    v_code, btrim(p_libelle), p_type, p_valeur, p_remise_max,
    COALESCE(p_frais_minimum, 0), p_ville_slug, p_fin, p_usages_max,
    COALESCE(p_usages_par_personne, 1), COALESCE(p_actif, true), v_uid
  )
  ON CONFLICT (code) DO UPDATE SET
    libelle = EXCLUDED.libelle, type = EXCLUDED.type, valeur = EXCLUDED.valeur,
    remise_max = EXCLUDED.remise_max, frais_minimum = EXCLUDED.frais_minimum,
    ville_slug = EXCLUDED.ville_slug, fin = EXCLUDED.fin,
    usages_max = EXCLUDED.usages_max,
    usages_par_personne = EXCLUDED.usages_par_personne,
    actif = EXCLUDED.actif
  RETURNING * INTO v_promo;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'promo_publier', 'promo_code', v_code,
          jsonb_build_object('type', p_type, 'valeur', p_valeur,
                             'actif', COALESCE(p_actif, true)));

  RETURN v_promo;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Qui voit quoi
--
-- Le catalogue des codes n'est pas public : un code lisible par tous ne serait
-- plus une promotion ciblée, il suffirait de lire la table. Seul le personnel
-- qui les gère y accède, et chacun voit ses propres utilisations.
-- ---------------------------------------------------------------------------

ALTER TABLE public.promo_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Codes promo reserves au personnel" ON public.promo_codes;
CREATE POLICY "Codes promo reserves au personnel" ON public.promo_codes
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'promotions.gerer'));

DROP POLICY IF EXISTS "Usages visibles" ON public.promo_redemptions;
CREATE POLICY "Usages visibles" ON public.promo_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'promotions.gerer'));

REVOKE ALL ON public.promo_codes, public.promo_redemptions FROM anon, authenticated;
GRANT SELECT ON public.promo_codes, public.promo_redemptions TO authenticated;
GRANT ALL ON public.promo_codes, public.promo_redemptions TO service_role;

-- L'evaluation est ouverte : c'est elle qui permet au client de savoir si son
-- code marche avant de commander. Elle ne revele rien d'autre que la remise et
-- la raison d'un refus, jamais la liste des codes.
GRANT EXECUTE ON FUNCTION public.promo_evaluer(text, uuid, text, numeric, numeric, uuid)
  TO authenticated;
REVOKE ALL ON FUNCTION public.promo_appliquer(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.promo_appliquer(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.promo_publier(text, text, text, numeric, numeric, numeric, text,
  timestamptz, integer, integer, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.promo_publier(text, text, text, numeric, numeric, numeric, text,
  timestamptz, integer, integer, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- Le prix recalculé à l'acceptation d'une offre reprend le code
--
-- Le shopper propose son prix, et le serveur recalcule frais et commission.
-- Sans reprise, la remise resterait celle du devis initial : trop généreuse si
-- le prix a baissé, ou dépassant la nouvelle commission, donc mordant sur le
-- gain du shopper, ce que toute cette migration s'emploie à éviter.
--
-- Le déclencheur se pose après le moteur : il ne décide rien, il rejoue la
-- même évaluation sur les montants qui viennent d'être arrêtés.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.promo_recalculer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_brute  numeric(12,2);
  v_eval   jsonb;
  v_remise numeric(12,2);
BEGIN
  IF NEW.promo_code IS NULL THEN
    NEW.promo_discount := 0;
    RETURN NEW;
  END IF;

  -- Tout est recalcule depuis les montants bruts, jamais depuis les montants
  -- deja remises. La fonction est donc idempotente : la rejouer sur la meme
  -- course rend le meme resultat, et une double application est impossible.
  v_brute := round(COALESCE(NEW.service_fee, 0) * COALESCE(NEW.commission_rate, 0), 2);

  v_eval := public.promo_evaluer(
    NEW.promo_code, NEW.customer_id, NEW.city,
    COALESCE(NEW.service_fee, 0), v_brute, NEW.id
  );

  v_remise := CASE WHEN (v_eval->>'valide')::boolean
                   THEN (v_eval->>'remise')::numeric ELSE 0 END;

  NEW.promo_discount := v_remise;
  -- La commission absorbe la remise. Le gain du shopper se calcule sur la
  -- commission BRUTE : c'est ce qui garantit qu'il ne bouge pas.
  NEW.commission_amount := v_brute - v_remise;
  NEW.runner_payout     := COALESCE(NEW.service_fee, 0) - v_brute;
  NEW.total_amount      := GREATEST(
    COALESCE(NEW.budget_estimate, 0) + COALESCE(NEW.service_fee, 0)
      + COALESCE(NEW.delivery_fee, 0) - v_remise, 0);

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS promo_recalculer ON public.errands;
CREATE TRIGGER promo_recalculer
  BEFORE UPDATE ON public.errands
  FOR EACH ROW
  WHEN (NEW.promo_code IS DISTINCT FROM OLD.promo_code
        OR NEW.service_fee IS DISTINCT FROM OLD.service_fee
        OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
        OR NEW.delivery_fee IS DISTINCT FROM OLD.delivery_fee)
  EXECUTE FUNCTION public.promo_recalculer();

-- ---------------------------------------------------------------------------
-- La garde absolue : une remise ne réduit jamais le gain du shopper
--
-- Les règles ci-dessus le garantissent, mais elles sont écrites à plusieurs
-- endroits et un ajout futur pourrait les contourner. Cette contrainte le rend
-- impossible, quel que soit le chemin d'écriture.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_promo_epargne_le_shopper()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF COALESCE(NEW.promo_discount, 0) > 0
     AND COALESCE(NEW.runner_payout, 0)
         < COALESCE(NEW.service_fee, 0) - COALESCE(NEW.commission_amount, 0)
             - COALESCE(NEW.promo_discount, 0) - 0.01 THEN
    RAISE EXCEPTION 'Une remise promotionnelle ne peut pas reduire le gain du shopper.'
      USING ERRCODE = '22023';
  END IF;

  IF COALESCE(NEW.commission_amount, 0) < 0 THEN
    RAISE EXCEPTION 'Une remise promotionnelle ne peut pas rendre la commission negative.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_promo_epargne_le_shopper ON public.errands;
CREATE TRIGGER guard_promo_epargne_le_shopper
  BEFORE INSERT OR UPDATE ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.guard_promo_epargne_le_shopper();
