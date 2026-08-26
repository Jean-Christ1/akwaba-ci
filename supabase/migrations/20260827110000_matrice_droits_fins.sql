-- Matrice de droits fins.
--
-- La plateforme reconnaissait quatre rôles : admin, moderator, partner, user.
-- Vingt-deux fonctions serveur décidaient d'un accès en demandant « est-ce un
-- admin ? ». Un rôle unique ouvrait donc, du même geste, la lecture des pièces
-- d'identité, l'approbation des retraits, la publication des tarifs et le
-- changement des rôles. Confier la trésorerie à quelqu'un revenait à lui
-- confier aussi les identités des shoppers.
--
-- Ce qui suit ne remplace rien : il ajoute une couche. `has_role` continue de
-- répondre comme avant, et les vingt-deux fonctions continuent de fonctionner.
-- Un droit se demande désormais par ce qu'il permet, pas par le titre de celui
-- qui le porte.
--
-- Trois niveaux, du plus général au plus précis :
--   1. le rôle d'exploitation, qui porte un jeu de droits par défaut ;
--   2. l'attribution d'un rôle à une personne ;
--   3. l'octroi ou le retrait d'un droit à une personne en particulier.
--
-- Les rôles sont des lignes, pas des valeurs d'énumération : un type énuméré
-- ne s'administre pas, il se migre. Ajouter un rôle « responsable conformité »
-- doit être un geste de console, pas un déploiement.

-- ---------------------------------------------------------------------------
-- 1. Catalogue des droits
--
-- Chaque code correspond à une action que la plateforme sait réellement faire.
-- Aucun droit n'est inventé pour une fonctionnalité qui n'existe pas : un
-- droit sans action derrière donne l'illusion d'un contrôle.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permissions (
  -- Deux segments au moins : « shoppers.lire », « shoppers.identite.lire ».
  code        text PRIMARY KEY CHECK (code ~ '^[a-z_]+(\.[a-z_]+)+$'),
  categorie   text NOT NULL,
  libelle     text NOT NULL,
  description text NOT NULL,
  -- Un droit sensible se voit accorder avec plus de precaution : la console
  -- le signale, et le journal d'audit le distingue.
  sensible    boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 100
);

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position) VALUES
  ('utilisateurs.lire',        'Utilisateurs', 'Consulter les comptes',
   'Voir la liste des comptes et leur fiche.', false, 10),
  ('utilisateurs.suspendre',   'Utilisateurs', 'Suspendre ou reactiver un compte',
   'Priver quelqu''un de l''acces a la plateforme, ou le lui rendre.', true, 20),
  ('roles.attribuer',          'Utilisateurs', 'Attribuer les roles et les droits',
   'Donner ou retirer un role d''exploitation. Ce droit permet d''en donner d''autres.', true, 30),

  ('shoppers.lire',            'Shoppers', 'Consulter les dossiers de shopper',
   'Voir les candidatures et les dossiers, sans les pieces d''identite.', false, 40),
  ('shoppers.identite.lire',   'Shoppers', 'Ouvrir les pieces d''identite',
   'Consulter la piece et le selfie deposes. Donnees personnelles sensibles.', true, 50),
  ('shoppers.valider',         'Shoppers', 'Valider ou refuser un dossier',
   'Prononcer la decision d''habilitation apres examen des pieces.', true, 60),
  ('shoppers.suspendre',       'Shoppers', 'Suspendre un shopper',
   'Interrompre l''activite d''un shopper. Le prive de son revenu.', true, 70),

  ('courses.lire',             'Courses', 'Suivre les courses',
   'Voir les courses, leur statut et les alertes d''exploitation.', false, 80),
  ('courses.deverrouiller',    'Courses', 'Rouvrir une remise verrouillee',
   'Rendre possible la saisie du code apres cinq erreurs.', false, 90),
  ('courses.corriger',         'Courses', 'Corriger une course',
   'Modifier une course en dehors du moteur. Touche a des montants.', true, 100),

  ('litiges.lire',             'Litiges', 'Consulter les litiges',
   'Voir les litiges ouverts et leurs pieces.', false, 110),
  ('litiges.trancher',         'Litiges', 'Trancher un litige',
   'Decider de l''issue d''un litige. Deplace de l''argent.', true, 120),

  ('paiements.lire',           'Finances', 'Consulter les paiements',
   'Voir les reglements, les commissions dues et les soldes.', false, 130),
  ('retraits.approuver',       'Finances', 'Approuver un retrait',
   'Autoriser le versement d''un solde a un shopper.', true, 140),
  ('commissions.encaisser',    'Finances', 'Enregistrer un encaissement de commission',
   'Inscrire qu''une commission due a ete percue.', true, 150),
  ('bareme.publier',           'Finances', 'Publier un bareme',
   'Changer les tarifs des courses ou le taux de commission.', true, 160),

  ('lieux.lire',               'Contenu', 'Consulter les lieux',
   'Voir les etablissements et leurs fiches.', false, 170),
  ('lieux.moderer',            'Contenu', 'Moderer les lieux',
   'Publier, refuser ou retirer une fiche d''etablissement.', false, 180),
  ('villes.gerer',             'Contenu', 'Gerer villes et quartiers',
   'Ouvrir ou fermer une ville aux courses, gerer les quartiers.', false, 190),

  ('organisations.lire',       'Organisations', 'Consulter les organisations',
   'Voir les entreprises et leurs membres.', false, 200),
  ('organisations.gerer',      'Organisations', 'Gerer les organisations',
   'Creer, modifier et fermer une organisation.', false, 210),

  ('paiements.fournisseurs',   'Reglages', 'Gerer les moyens de paiement',
   'Activer ou desactiver un moyen de paiement propose aux clients.', true, 220),
  ('notifications.envoyer',    'Reglages', 'Envoyer des notifications',
   'Declencher un envoi vers des utilisateurs.', false, 230),
  ('exploitation.sante',       'Reglages', 'Voir la sante de l''exploitation',
   'Consulter les taches planifiees et la file de notifications.', false, 240),

  ('audit.lire',               'Conformite', 'Consulter le journal d''audit',
   'Lire la trace des decisions prises sur la plateforme.', true, 250),
  ('donnees.exporter',         'Conformite', 'Exporter des donnees',
   'Extraire des donnees hors de l''application.', true, 260)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, sensible = EXCLUDED.sensible,
  position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- 2. Rôles d'exploitation, administrables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_roles (
  code        text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  libelle     text NOT NULL,
  description text NOT NULL,
  -- Un rôle de socle ne se supprime pas : la plateforme ne fonctionnerait plus.
  systeme     boolean NOT NULL DEFAULT false,
  position    integer NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.staff_roles (code, libelle, description, systeme, position) VALUES
  ('super_admin',      'Super administrateur',
   'Tous les droits, y compris celui d''en attribuer. A reserver a une ou deux personnes.', true, 10),
  ('admin_plateforme', 'Administrateur plateforme',
   'Exploitation courante, sans acces aux pieces d''identite ni au journal d''audit.', true, 20),
  ('admin_operations', 'Responsable exploitation',
   'Suivi des courses, litiges, villes et quartiers.', true, 30),
  ('admin_finance',    'Responsable financier',
   'Paiements, retraits, commissions et baremes. Aucun acces aux identites.', true, 40),
  ('admin_support',    'Agent de support',
   'Consultation large, decisions limitees au deverrouillage d''une remise.', true, 50),
  ('admin_conformite', 'Responsable conformite',
   'Pieces d''identite, journal d''audit et exports. Aucun pouvoir sur l''argent.', true, 60),
  ('admin_contenu',    'Responsable contenu',
   'Etablissements, fiches et moderation editoriale.', true, 70)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle, description = EXCLUDED.description,
  systeme = EXCLUDED.systeme, position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- 3. La matrice : quel rôle porte quel droit
--
-- Le principe retenu est la séparation. Le responsable financier déplace de
-- l'argent mais ne voit aucune pièce d'identité ; le responsable conformité
-- voit les pièces et le journal mais ne touche pas à l'argent. Personne, hors
-- super administrateur, ne peut à la fois décider et effacer la trace.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_code       text NOT NULL REFERENCES public.staff_roles(code) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  PRIMARY KEY (role_code, permission_code)
);

-- Le super administrateur porte tout, y compris les droits ajoutes plus tard :
-- la ligne est recalculee a chaque application de cette migration.
INSERT INTO public.role_permissions (role_code, permission_code)
SELECT 'super_admin', code FROM public.permissions
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('admin_plateforme', 'utilisateurs.lire'),
  ('admin_plateforme', 'utilisateurs.suspendre'),
  ('admin_plateforme', 'shoppers.lire'),
  ('admin_plateforme', 'courses.lire'),
  ('admin_plateforme', 'courses.deverrouiller'),
  ('admin_plateforme', 'litiges.lire'),
  ('admin_plateforme', 'paiements.lire'),
  ('admin_plateforme', 'lieux.lire'),
  ('admin_plateforme', 'lieux.moderer'),
  ('admin_plateforme', 'villes.gerer'),
  ('admin_plateforme', 'organisations.lire'),
  ('admin_plateforme', 'organisations.gerer'),
  ('admin_plateforme', 'exploitation.sante'),
  ('admin_plateforme', 'notifications.envoyer'),

  ('admin_operations', 'courses.lire'),
  ('admin_operations', 'courses.deverrouiller'),
  ('admin_operations', 'litiges.lire'),
  ('admin_operations', 'litiges.trancher'),
  ('admin_operations', 'shoppers.lire'),
  ('admin_operations', 'shoppers.suspendre'),
  ('admin_operations', 'villes.gerer'),
  ('admin_operations', 'exploitation.sante'),

  ('admin_finance', 'paiements.lire'),
  ('admin_finance', 'retraits.approuver'),
  ('admin_finance', 'commissions.encaisser'),
  ('admin_finance', 'bareme.publier'),
  ('admin_finance', 'paiements.fournisseurs'),
  ('admin_finance', 'courses.lire'),

  ('admin_support', 'utilisateurs.lire'),
  ('admin_support', 'shoppers.lire'),
  ('admin_support', 'courses.lire'),
  ('admin_support', 'courses.deverrouiller'),
  ('admin_support', 'litiges.lire'),
  ('admin_support', 'organisations.lire'),

  ('admin_conformite', 'shoppers.lire'),
  ('admin_conformite', 'shoppers.identite.lire'),
  ('admin_conformite', 'shoppers.valider'),
  ('admin_conformite', 'audit.lire'),
  ('admin_conformite', 'donnees.exporter'),
  ('admin_conformite', 'utilisateurs.lire'),

  ('admin_contenu', 'lieux.lire'),
  ('admin_contenu', 'lieux.moderer'),
  ('admin_contenu', 'villes.gerer')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Attribution à une personne
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.staff_assignments (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_code   text NOT NULL REFERENCES public.staff_roles(code) ON DELETE CASCADE,
  granted_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_code)
);

-- Un droit accordé ou retiré à une personne en particulier, par-dessus son
-- rôle. Sans cela, faire une exception obligerait à créer un rôle entier.
CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_code text NOT NULL REFERENCES public.permissions(code) ON DELETE CASCADE,
  -- Faux veut dire « retiré », et le retrait l'emporte sur le rôle : c'est le
  -- sens d'une exception, et c'est le sens prudent.
  accorde         boolean NOT NULL DEFAULT true,
  motif           text,
  granted_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_code)
);

-- ---------------------------------------------------------------------------
-- 5. La question qu'on pose au serveur
--
-- Elle remplace « est-ce un admin ? » par « a-t-il le droit de faire ceci ? ».
-- Le rôle hérité `admin` conserve tous les droits : sans cela, cette migration
-- fermerait la console à la seule personne qui l'administre aujourd'hui.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    -- Un retrait nominatif prime sur tout, y compris sur le role herite.
    WHEN EXISTS (SELECT 1 FROM public.user_permissions
                  WHERE user_id = _user_id AND permission_code = _code AND NOT accorde)
      THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_permissions
                  WHERE user_id = _user_id AND permission_code = _code AND accorde)
      THEN true
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.staff_assignments a
      JOIN public.role_permissions rp ON rp.role_code = a.role_code
      WHERE a.user_id = _user_id AND rp.permission_code = _code
    )
  END;
$$;

COMMENT ON FUNCTION public.has_permission(uuid, text) IS
  'Vrai si la personne porte ce droit, par role, par octroi nominatif, ou par le role herite admin. Un retrait nominatif prime sur tout.';

/** Tous les droits d'une personne, pour que la console sache quoi afficher. */
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(p.code ORDER BY p.position), ARRAY[]::text[])
  FROM public.permissions p
  WHERE public.has_permission(auth.uid(), p.code);
$$;

-- ---------------------------------------------------------------------------
-- 6. Attribuer un rôle, et le tracer
--
-- Le droit d'attribuer est le seul qui se reproduise : celui qui le porte peut
-- se donner tous les autres. Il ne s'accorde donc pas par rôle ordinaire, et
-- chaque attribution est inscrite.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_assign_role(
  p_user_id   uuid,
  p_role_code text,
  p_accorder  boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_moi uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''attribuer un role.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.staff_roles WHERE code = p_role_code) THEN
    RAISE EXCEPTION 'Role inconnu : %.', p_role_code USING ERRCODE = '22023';
  END IF;

  -- Se retirer soi-meme le dernier role d'attribution fermerait la console a
  -- tout le monde, sans moyen de la rouvrir depuis l'application.
  IF NOT p_accorder AND p_user_id = v_moi AND p_role_code = 'super_admin' THEN
    RAISE EXCEPTION 'Vous ne pouvez pas vous retirer vous-meme le role de super administrateur.'
      USING ERRCODE = '42501';
  END IF;

  IF p_accorder THEN
    INSERT INTO public.staff_assignments (user_id, role_code, granted_by)
    VALUES (p_user_id, p_role_code, v_moi)
    ON CONFLICT (user_id, role_code) DO NOTHING;
  ELSE
    DELETE FROM public.staff_assignments
     WHERE user_id = p_user_id AND role_code = p_role_code;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, CASE WHEN p_accorder THEN 'grant_role' ELSE 'revoke_role' END,
          'staff_assignment', p_user_id::text,
          jsonb_build_object('role', p_role_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_set_permission(
  p_user_id uuid,
  p_code    text,
  p_accorde boolean,
  p_motif   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_moi uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier les droits.' USING ERRCODE = '42501';
  END IF;

  -- Une exception nominative se justifie : sans motif, personne ne saura dans
  -- six mois pourquoi cette personne a ce droit et pas les autres.
  IF char_length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de cette exception.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_permissions (user_id, permission_code, accorde, motif, granted_by)
  VALUES (p_user_id, p_code, p_accorde, btrim(p_motif), v_moi)
  ON CONFLICT (user_id, permission_code) DO UPDATE
    SET accorde = EXCLUDED.accorde, motif = EXCLUDED.motif,
        granted_by = EXCLUDED.granted_by, granted_at = now();

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, CASE WHEN p_accorde THEN 'grant_permission' ELSE 'revoke_permission' END,
          'user_permission', p_user_id::text,
          jsonb_build_object('droit', p_code, 'motif', btrim(p_motif)));
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Qui voit quoi
--
-- Le catalogue des droits et des rôles est public en lecture : savoir qu'un
-- droit « approuver un retrait » existe ne donne rien à personne, et le taire
-- empêcherait la console de l'afficher. Ce qui est protégé, c'est de savoir
-- QUI porte quoi, et surtout de pouvoir l'écrire.
-- ---------------------------------------------------------------------------

ALTER TABLE public.permissions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions   ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.permissions        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_roles        FORCE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions   FORCE ROW LEVEL SECURITY;
ALTER TABLE public.staff_assignments  FORCE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions   FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Catalogue des droits lisible" ON public.permissions;
CREATE POLICY "Catalogue des droits lisible" ON public.permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Catalogue des roles lisible" ON public.staff_roles;
CREATE POLICY "Catalogue des roles lisible" ON public.staff_roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Matrice lisible" ON public.role_permissions;
CREATE POLICY "Matrice lisible" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

-- Chacun voit ses propres attributions ; voir celles des autres demande le
-- droit de consulter les comptes.
DROP POLICY IF EXISTS "Attributions visibles" ON public.staff_assignments;
CREATE POLICY "Attributions visibles" ON public.staff_assignments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'utilisateurs.lire'));

DROP POLICY IF EXISTS "Exceptions visibles" ON public.user_permissions;
CREATE POLICY "Exceptions visibles" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'utilisateurs.lire'));

-- Aucune politique d'ecriture n'est posee : l'ecriture passe uniquement par
-- staff_assign_role et staff_set_permission, qui tracent. Sans politique,
-- INSERT et UPDATE sont refuses, ce qui est l'effet recherche.

REVOKE ALL ON public.permissions, public.staff_roles, public.role_permissions,
              public.staff_assignments, public.user_permissions FROM anon, authenticated;
GRANT SELECT ON public.permissions, public.staff_roles, public.role_permissions,
              public.staff_assignments, public.user_permissions TO authenticated;
GRANT ALL ON public.permissions, public.staff_roles, public.role_permissions,
              public.staff_assignments, public.user_permissions TO service_role;

GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;
REVOKE ALL ON FUNCTION public.staff_assign_role(uuid, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_assign_role(uuid, text, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.staff_set_permission(uuid, text, boolean, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.staff_set_permission(uuid, text, boolean, text) TO authenticated;

-- L'administrateur en place recoit le role de super administrateur : sans
-- cela, la matrice serait vide et personne ne pourrait attribuer le premier
-- role, y compris a soi-meme.
INSERT INTO public.staff_assignments (user_id, role_code)
SELECT user_id, 'super_admin' FROM public.user_roles WHERE role = 'admin'::app_role
ON CONFLICT DO NOTHING;
