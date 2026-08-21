-- ---------------------------------------------------------------------------
-- Les comptes entreprises.
--
-- Un hôtel, un bureau, un commerce commandent des courses tous les jours, mais
-- chaque personne les commande sous son propre compte : la direction ne voit
-- rien, l'historique se disperse, et quand quelqu'un part son historique part
-- avec lui.
--
-- Ce que cette migration apporte, et rien d'autre : une organisation, ses
-- membres, et le rattachement d'une course à cette organisation. Le paiement
-- reste exactement ce qu'il est aujourd'hui, chaque course étant réglée comme
-- avant par la personne qui l'a demandée. La facturation groupée dépend du
-- prestataire de paiement, qui n'est pas choisi : l'inventer ici reviendrait à
-- promettre un flux d'argent qui n'existe pas.
--
-- L'adhésion se fait par un code que l'organisation communique elle-même. Pas
-- d'invitation par courriel : le service d'envoi est une décision ouverte, et
-- une invitation qui ne part jamais est pire que pas d'invitation du tout.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_member_role') THEN
    CREATE TYPE public.org_member_role AS ENUM ('owner', 'manager', 'member');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.organisations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  contact_email  text,
  contact_phone  text,
  -- Le code d'adhésion se remplace : un code qui a circulé trop largement doit
  -- pouvoir être coupé sans refaire l'organisation.
  join_code      text NOT NULL,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organisations_name_len CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  CONSTRAINT organisations_join_code_len CHECK (char_length(join_code) BETWEEN 8 AND 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_organisations_join_code ON public.organisations (join_code);

CREATE TABLE IF NOT EXISTS public.organisation_members (
  organisation_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            public.org_member_role NOT NULL DEFAULT 'member',
  joined_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organisation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_organisation_members_user ON public.organisation_members (user_id);

-- Le rattachement d'une course. ON DELETE SET NULL : une organisation
-- supprimée ne doit pas emporter les courses ni leur trace comptable.
ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES public.organisations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_errands_organisation ON public.errands (organisation_id)
  WHERE organisation_id IS NOT NULL;

-- Les droits de lecture de la table des courses se calculent colonne par
-- colonne : la nouvelle colonne doit y entrer, sinon elle serait illisible.
SELECT public.refresh_errand_column_grants();

-- ---------------------------------------------------------------------------
-- Qui appartient à quoi.
--
-- La question se pose depuis les politiques de sécurité des deux tables, donc
-- elle ne peut pas s'y répondre par une lecture directe : la politique se
-- consulterait elle-même. Elle passe par une fonction qui s'exécute sous son
-- propriétaire.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_org_member(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_members
    WHERE organisation_id = p_org AND user_id = p_user
  );
$$;

CREATE OR REPLACE FUNCTION public.org_role(p_org uuid, p_user uuid DEFAULT auth.uid())
RETURNS public.org_member_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organisation_members
  WHERE organisation_id = p_org AND user_id = p_user;
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_role(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Ce que chacun peut lire.
--
-- Le code d'adhésion n'est pas une donnée comme les autres : qui le lit entre
-- dans l'organisation. Il est donc retiré de la lecture ordinaire et n'est
-- rendu qu'aux responsables, par une fonction.
-- ---------------------------------------------------------------------------

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organisation_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organisation visible aux membres" ON public.organisations;
CREATE POLICY "Organisation visible aux membres"
  ON public.organisations FOR SELECT TO authenticated
  USING (
    public.is_org_member(id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

DROP POLICY IF EXISTS "Membres visibles entre eux" ON public.organisation_members;
CREATE POLICY "Membres visibles entre eux"
  ON public.organisation_members FOR SELECT TO authenticated
  USING (
    public.is_org_member(organisation_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- Aucune ecriture directe : tout passe par les fonctions, qui portent les
-- regles. Une table ouverte en ecriture laisserait un membre se nommer
-- proprietaire.
REVOKE ALL ON public.organisations FROM anon, authenticated;
REVOKE ALL ON public.organisation_members FROM anon, authenticated;
GRANT SELECT (id, name, contact_email, contact_phone, created_by, created_at, updated_at)
  ON public.organisations TO authenticated;
GRANT SELECT ON public.organisation_members TO authenticated;
GRANT ALL ON public.organisations TO service_role;
GRANT ALL ON public.organisation_members TO service_role;

-- ---------------------------------------------------------------------------
-- Créer une organisation.
--
-- Celui qui la crée en est propriétaire : sans cela, une organisation naîtrait
-- sans personne pour en gérer les membres.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organisation_create(
  p_name text,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS public.organisations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_org public.organisations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté pour créer une organisation.' USING ERRCODE = '42501';
  END IF;

  IF char_length(btrim(COALESCE(p_name, ''))) < 2 THEN
    RAISE EXCEPTION 'Le nom de l''organisation est trop court.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organisations (name, contact_email, contact_phone, join_code, created_by)
  VALUES (
    btrim(p_name),
    NULLIF(btrim(COALESCE(p_contact_email, '')), ''),
    NULLIF(btrim(COALESCE(p_contact_phone, '')), ''),
    -- Douze caractères tirés d'un identifiant aléatoire : assez pour qu'un code
    -- ne se devine pas, assez court pour se dicter au téléphone. La source est
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
    v_uid
  )
  RETURNING * INTO v_org;

  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  VALUES (v_org.id, v_uid, 'owner'::org_member_role);

  RETURN v_org;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Rejoindre par le code.
--
-- Le code est comparé sans distinction de casse ni d'espaces : il se dicte de
-- vive voix, et un espace de trop ne doit pas devenir un refus incompréhensible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organisation_join(p_code text)
RETURNS public.organisations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_org public.organisations;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté pour rejoindre une organisation.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_org
  FROM public.organisations
  WHERE join_code = upper(regexp_replace(COALESCE(p_code, ''), '[[:space:]]', '', 'g'));

  IF NOT FOUND THEN
    -- Le message ne dit pas si le code a existé : ce serait un moyen de les
    -- éprouver un par un.
    RAISE EXCEPTION 'Ce code d''organisation n''est pas valide.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.organisation_members (organisation_id, user_id, role)
  VALUES (v_org.id, v_uid, 'member'::org_member_role)
  ON CONFLICT (organisation_id, user_id) DO NOTHING;

  RETURN v_org;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Gérer les membres.
--
-- Une organisation sans propriétaire ne se gère plus : plus personne ne peut
-- changer un rôle, retirer un membre ni renouveler le code. Le dernier
-- propriétaire ne peut donc être ni rétrogradé, ni retiré, ni partir.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organisation_set_member_role(
  p_org uuid,
  p_user uuid,
  p_role public.org_member_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi public.org_member_role := public.org_role(p_org, auth.uid());
BEGIN
  IF v_moi IS DISTINCT FROM 'owner'::org_member_role THEN
    RAISE EXCEPTION 'Seul un propriétaire peut changer un rôle.' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_org_member(p_org, p_user) THEN
    RAISE EXCEPTION 'Cette personne n''appartient pas à l''organisation.' USING ERRCODE = '22023';
  END IF;

  IF p_role <> 'owner'::org_member_role
     AND public.org_role(p_org, p_user) = 'owner'::org_member_role
     AND (SELECT count(*) FROM public.organisation_members
          WHERE organisation_id = p_org AND role = 'owner'::org_member_role) <= 1 THEN
    RAISE EXCEPTION 'L''organisation doit garder au moins un propriétaire.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organisation_members
  SET role = p_role
  WHERE organisation_id = p_org AND user_id = p_user;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.organisation_remove_member(p_org uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi public.org_member_role := public.org_role(p_org, auth.uid());
BEGIN
  -- Partir de soi-même est toujours permis ; retirer quelqu'un d'autre demande
  -- d'en avoir la charge.
  IF p_user <> auth.uid()
     AND (v_moi IS NULL
          OR v_moi NOT IN ('owner'::org_member_role, 'manager'::org_member_role)) THEN
    RAISE EXCEPTION 'Vous ne gérez pas les membres de cette organisation.' USING ERRCODE = '42501';
  END IF;

  IF public.org_role(p_org, p_user) = 'owner'::org_member_role
     AND (SELECT count(*) FROM public.organisation_members
          WHERE organisation_id = p_org AND role = 'owner'::org_member_role) <= 1 THEN
    RAISE EXCEPTION 'L''organisation doit garder au moins un propriétaire.' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.organisation_members
  WHERE organisation_id = p_org AND user_id = p_user;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Le code d'adhésion : le lire, et le renouveler.
--
-- Il n'est pas dans les colonnes lisibles de la table : le rendre par une
-- fonction permet de le réserver à ceux qui gèrent l'organisation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organisation_join_code(p_org uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi public.org_member_role := public.org_role(p_org, auth.uid());
BEGIN
  -- Un non-membre n'a pas de rôle : la comparaison rend alors l'inconnu, qui
  -- n'est pas vrai, et la garde ne se déclenchait pas. Le cas est nommé.
  IF v_moi IS NULL OR v_moi NOT IN ('owner'::org_member_role, 'manager'::org_member_role) THEN
    RAISE EXCEPTION 'Seuls les responsables voient le code d''adhésion.' USING ERRCODE = '42501';
  END IF;
  RETURN (SELECT join_code FROM public.organisations WHERE id = p_org);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.organisation_rotate_join_code(p_org uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi  public.org_member_role := public.org_role(p_org, auth.uid());
  v_code text;
BEGIN
  -- Un non-membre n'a pas de rôle : la comparaison rend alors l'inconnu, qui
  -- n'est pas vrai, et la garde ne se déclenchait pas. Le cas est nommé.
  IF v_moi IS NULL OR v_moi NOT IN ('owner'::org_member_role, 'manager'::org_member_role) THEN
    RAISE EXCEPTION 'Seuls les responsables renouvellent le code d''adhésion.' USING ERRCODE = '42501';
  END IF;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  UPDATE public.organisations
  SET join_code = v_code, updated_at = now()
  WHERE id = p_org;

  RETURN v_code;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Rattacher une course à son organisation.
--
-- Le rattachement se décide au moment de la demande, jamais après coup sur une
-- course déjà en route : le shopper, le prix et les preuves sont déjà engagés,
-- et changer le compte auquel elle appartient réécrirait un historique.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_set_organisation(p_errand_id uuid, p_organisation_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.customer_id <> auth.uid() THEN
    RAISE EXCEPTION 'Seul le client de la course peut la rattacher à une organisation.'
      USING ERRCODE = '42501';
  END IF;

  IF v_errand.status NOT IN ('draft'::errand_status, 'open'::errand_status) THEN
    RAISE EXCEPTION 'Une course déjà attribuée ne change plus d''organisation.'
      USING ERRCODE = '22023';
  END IF;

  IF p_organisation_id IS NOT NULL AND NOT public.is_org_member(p_organisation_id, auth.uid()) THEN
    RAISE EXCEPTION 'Vous n''appartenez pas à cette organisation.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands
  SET organisation_id = p_organisation_id, updated_at = now()
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM set_config('app.errand_engine', 'off', true);

  RETURN v_errand;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Ce que l'organisation voit de ses courses.
--
-- Pas d'élargissement de la visibilité des courses elles-mêmes : l'adresse de
-- remise et les notes du client sont lisibles colonne par colonne dès que la
-- ligne l'est, et un collègue n'a pas à lire l'adresse personnelle d'un autre.
-- Cette fonction rend ce qu'une direction a besoin de suivre, et rien de plus.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organisation_errands(p_org uuid, p_limit integer DEFAULT 100)
RETURNS TABLE (
  id             uuid,
  title          text,
  category       public.errand_category,
  city           text,
  zone           text,
  status         public.errand_status,
  payment_status public.pay_status,
  total_amount   numeric,
  service_fee    numeric,
  created_at     timestamptz,
  demandeur      text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.is_org_member(p_org, auth.uid())
     AND NOT public.has_role(auth.uid(), 'admin'::app_role)
     AND NOT public.has_role(auth.uid(), 'moderator'::app_role) THEN
    RAISE EXCEPTION 'Vous n''appartenez pas à cette organisation.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.title, e.category, e.city, e.zone, e.status, e.payment_status,
         e.total_amount, e.service_fee, e.created_at,
         COALESCE(p.display_name, 'Membre retiré')
  FROM public.errands e
  LEFT JOIN public.profiles p ON p.id = e.customer_id
  WHERE e.organisation_id = p_org
  ORDER BY e.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$fn$;

REVOKE ALL ON FUNCTION public.organisation_create(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organisation_join(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organisation_set_member_role(uuid, uuid, public.org_member_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organisation_remove_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organisation_join_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organisation_rotate_join_code(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.errand_set_organisation(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.organisation_errands(uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.organisation_create(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_join(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_set_member_role(uuid, uuid, public.org_member_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_join_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_rotate_join_code(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.errand_set_organisation(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.organisation_errands(uuid, integer) TO authenticated;
