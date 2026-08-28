-- La séparation des rôles devient réelle.
--
-- La matrice des droits existe : trente-quatre permissions, huit rôles, et des
-- descriptions qui promettent une séparation nette. « Responsable financier :
-- aucun accès aux pièces d'identité. » « Administrateur plateforme : sans accès
-- aux pièces d'identité ni au journal d'audit. »
--
-- Ces phrases ne sont tenues par rien. Deux trous, l'un démontré, l'autre
-- structurel, les vident de leur sens.
--
-- Le premier est une escalade de privilèges. Qui détient « roles.attribuer »
-- peut s'accorder n'importe quelle permission et s'attribuer le rôle de super
-- administrateur. Vérifié contre la base : un compte « admin_plateforme » à qui
-- l'on délègue ce seul droit s'accorde « audit.lire » puis « super_admin » en
-- deux appels, sans que rien ne l'arrête. Aujourd'hui seul le super
-- administrateur porte ce droit, ce qui masque le trou : le jour où on le
-- délègue, ce qui est le propre d'un droit d'attribution, la séparation tombe
-- entièrement.
--
-- Le second est un contournement. has_permission accorde tout à quiconque porte
-- le rôle hérité « admin » dans user_roles, sans regarder la matrice. Une
-- personne peut donc détenir les trente-quatre permissions sans figurer dans
-- aucune attribution, et l'écran des droits ne le montre nulle part. C'est un
-- accès de secours légitime, mais un accès de secours qu'on ne voit pas est un
-- accès de secours qu'on oublie.
--
-- Ce que cette migration pose :
--
--  1. Le confinement. On ne peut accorder que ce qu'on détient soi-même, et
--     jamais à soi-même. C'est la règle qui rend la délégation sûre.
--  2. Les périmètres. Un responsable d'exploitation peut être limité à Bouaké.
--  3. Les échéances. Un droit exceptionnel peut expirer tout seul.
--  4. La documentation de ce qu'une permission NE permet PAS.
--  5. Les permissions effectives d'une personne, avec la source de chacune.
--  6. La réconciliation entre ce qui prétend donner l'accès et ce qui l'applique.

-- ---------------------------------------------------------------------------
-- 1. Ce qu'une permission ne permet pas
--
-- Une description dit ce qu'un droit ouvre. Elle ne dit jamais où il s'arrête,
-- et c'est pourtant la question de celui qui l'accorde. « Voir les pièces
-- d'identité » ouvre-t-il le téléchargement ? La description ne le disait pas.
-- ---------------------------------------------------------------------------

ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS ne_permet_pas text,
  ADD COLUMN IF NOT EXISTS portee text NOT NULL DEFAULT 'global';

ALTER TABLE public.permissions DROP CONSTRAINT IF EXISTS permissions_portee_check;
ALTER TABLE public.permissions ADD CONSTRAINT permissions_portee_check
  CHECK (portee IN ('global', 'ville'));

COMMENT ON COLUMN public.permissions.ne_permet_pas IS
  'Ce que le droit n''ouvre pas, dit explicitement, pour qu''on l''accorde en connaissance de cause.';
COMMENT ON COLUMN public.permissions.portee IS
  'global : le droit vaut partout. ville : il peut être restreint à une ou plusieurs villes.';

-- ---------------------------------------------------------------------------
-- 2. Le rang d'un rôle
--
-- La matrice se lit de gauche à droite, du moins au plus étendu. Sans rang,
-- l'ordre des colonnes dépendait de l'ordre alphabétique, et « admin_conformite »
-- passait avant « super_admin ».
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_roles
  ADD COLUMN IF NOT EXISTS niveau smallint NOT NULL DEFAULT 50;

UPDATE public.staff_roles SET niveau = CASE code
  WHEN 'moderateur'       THEN 10
  WHEN 'admin_support'    THEN 20
  WHEN 'admin_contenu'    THEN 30
  WHEN 'admin_operations' THEN 40
  WHEN 'admin_finance'    THEN 50
  WHEN 'admin_conformite' THEN 60
  WHEN 'admin_plateforme' THEN 80
  WHEN 'super_admin'      THEN 100
  ELSE 50
END;

COMMENT ON COLUMN public.staff_roles.niveau IS
  'Rang d''affichage et de confinement. Un rôle ne peut pas en attribuer un de rang supérieur au sien.';

-- ---------------------------------------------------------------------------
-- 3. Périmètres et échéances
--
-- Une attribution vaut partout et pour toujours. Les deux sont des choix par
-- défaut discutables : un responsable recruté pour ouvrir Bouaké n'a pas besoin
-- d'Abidjan, et un droit prêté le temps d'un congé devrait se refermer seul.
-- ---------------------------------------------------------------------------

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS scope_type  text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS scope_value text,
  ADD COLUMN IF NOT EXISTS expire_le   timestamptz,
  ADD COLUMN IF NOT EXISTS motif       text;

ALTER TABLE public.staff_assignments DROP CONSTRAINT IF EXISTS staff_assignments_scope_check;
ALTER TABLE public.staff_assignments ADD CONSTRAINT staff_assignments_scope_check
  CHECK (
    (scope_type = 'global' AND scope_value IS NULL)
    OR (scope_type = 'ville' AND scope_value IS NOT NULL)
  );

-- La clé primaire portait sur (personne, rôle). Elle interdisait donc de
-- confier le même rôle sur deux villes, ce qui est le cas le plus courant dès
-- qu'on ouvre une seconde ville.
ALTER TABLE public.staff_assignments DROP CONSTRAINT IF EXISTS staff_assignments_pkey;
CREATE UNIQUE INDEX IF NOT EXISTS staff_assignments_unique
  ON public.staff_assignments (user_id, role_code, COALESCE(scope_value, '*'));

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS expire_le timestamptz;

COMMENT ON COLUMN public.staff_assignments.expire_le IS
  'Échéance de l''attribution. NULL = sans terme. Une attribution échue ne donne plus rien.';
COMMENT ON COLUMN public.user_permissions.expire_le IS
  'Échéance de l''exception nominative. NULL = sans terme.';

-- ---------------------------------------------------------------------------
-- 4. has_permission tient compte des échéances
--
-- Un droit qui expire mais continue d'ouvrir n'expire pas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    -- Un retrait nominatif prime sur tout, y compris sur le role herite.
    WHEN EXISTS (SELECT 1 FROM public.user_permissions
                  WHERE user_id = _user_id AND permission_code = _code AND NOT accorde
                    AND (expire_le IS NULL OR expire_le > now()))
      THEN false
    WHEN EXISTS (SELECT 1 FROM public.user_permissions
                  WHERE user_id = _user_id AND permission_code = _code AND accorde
                    AND (expire_le IS NULL OR expire_le > now()))
      THEN true
    -- L'acces de secours herite. Il reste, parce que se fermer soi-meme la
    -- console sans moyen de la rouvrir serait pire ; mais il est desormais
    -- visible dans permissions_effectives et dans la reconciliation.
    WHEN public.has_role(_user_id, 'admin'::app_role) THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.staff_assignments a
      JOIN public.role_permissions rp ON rp.role_code = a.role_code
      WHERE a.user_id = _user_id AND rp.permission_code = _code
        AND (a.expire_le IS NULL OR a.expire_le > now())
    )
  END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Le droit, dans un périmètre
--
-- Sans attribution restreinte, le droit vaut partout : c'est le cas de la
-- quasi-totalite des comptes, et il ne faut pas leur compliquer la vie. Dès
-- qu'une restriction existe, elle s'applique.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_scoped_permission(
  _user_id     uuid,
  _code        text,
  _scope_value text DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT public.has_permission(_user_id, _code)
     AND (
       _scope_value IS NULL
       -- Une exception nominative n'a pas de perimetre : elle vaut partout.
       OR EXISTS (SELECT 1 FROM public.user_permissions
                   WHERE user_id = _user_id AND permission_code = _code AND accorde
                     AND (expire_le IS NULL OR expire_le > now()))
       OR public.has_role(_user_id, 'admin'::app_role)
       -- Aucune attribution restreinte pour ce droit : rien ne limite.
       OR NOT EXISTS (
         SELECT 1 FROM public.staff_assignments a
           JOIN public.role_permissions rp ON rp.role_code = a.role_code
          WHERE a.user_id = _user_id AND rp.permission_code = _code
            AND a.scope_type = 'ville'
            AND (a.expire_le IS NULL OR a.expire_le > now())
       )
       -- Une attribution globale suffit, sinon il faut la bonne ville.
       OR EXISTS (
         SELECT 1 FROM public.staff_assignments a
           JOIN public.role_permissions rp ON rp.role_code = a.role_code
          WHERE a.user_id = _user_id AND rp.permission_code = _code
            AND (a.expire_le IS NULL OR a.expire_le > now())
            AND (a.scope_type = 'global' OR lower(a.scope_value) = lower(_scope_value))
       )
     );
$fn$;

REVOKE ALL ON FUNCTION public.has_scoped_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scoped_permission(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.has_scoped_permission(uuid, text, text) IS
  'Le droit, dans une ville. Sans attribution restreinte, il vaut partout.';

-- ---------------------------------------------------------------------------
-- 6. Les permissions effectives, et d'où elles viennent
--
-- Savoir qu'une personne a un droit ne suffit pas : pour le lui retirer, il
-- faut savoir par où il lui arrive. Un droit qui vient de trois sources se
-- retire trois fois, et n'en retirer qu'une ne fait rien.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.permissions_effectives(_user_id uuid)
RETURNS TABLE (
  code       text,
  libelle    text,
  categorie  text,
  sensible   boolean,
  accordee   boolean,
  source     text,
  detail     text,
  perimetre  text,
  expire_le  timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT (public.has_permission(auth.uid(), 'roles.attribuer')
          OR public.has_permission(auth.uid(), 'utilisateurs.lire')
          OR auth.uid() = _user_id) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter les droits d''autrui.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.code, p.libelle, p.categorie, p.sensible,
         public.has_permission(_user_id, p.code) AS accordee,
         CASE
           WHEN EXISTS (SELECT 1 FROM public.user_permissions up
                         WHERE up.user_id = _user_id AND up.permission_code = p.code
                           AND NOT up.accorde AND (up.expire_le IS NULL OR up.expire_le > now()))
             THEN 'retrait'
           WHEN EXISTS (SELECT 1 FROM public.user_permissions up
                         WHERE up.user_id = _user_id AND up.permission_code = p.code
                           AND up.accorde AND (up.expire_le IS NULL OR up.expire_le > now()))
             THEN 'nominatif'
           WHEN public.has_role(_user_id, 'admin'::app_role) THEN 'secours'
           WHEN EXISTS (SELECT 1 FROM public.staff_assignments a
                          JOIN public.role_permissions rp ON rp.role_code = a.role_code
                         WHERE a.user_id = _user_id AND rp.permission_code = p.code
                           AND (a.expire_le IS NULL OR a.expire_le > now()))
             THEN 'role'
           ELSE 'aucune'
         END AS source,
         CASE
           WHEN EXISTS (SELECT 1 FROM public.user_permissions up
                         WHERE up.user_id = _user_id AND up.permission_code = p.code
                           AND (up.expire_le IS NULL OR up.expire_le > now()))
             THEN (SELECT up.motif FROM public.user_permissions up
                    WHERE up.user_id = _user_id AND up.permission_code = p.code)
           WHEN public.has_role(_user_id, 'admin'::app_role)
                AND NOT EXISTS (SELECT 1 FROM public.staff_assignments a
                                  JOIN public.role_permissions rp ON rp.role_code = a.role_code
                                 WHERE a.user_id = _user_id AND rp.permission_code = p.code)
             THEN 'Rôle hérité admin : accorde tout, sans figurer dans la matrice.'
           ELSE (SELECT string_agg(DISTINCT sr.libelle, ', ')
                   FROM public.staff_assignments a
                   JOIN public.role_permissions rp ON rp.role_code = a.role_code
                   JOIN public.staff_roles sr ON sr.code = a.role_code
                  WHERE a.user_id = _user_id AND rp.permission_code = p.code
                    AND (a.expire_le IS NULL OR a.expire_le > now()))
         END AS detail,
         COALESCE(
           (SELECT string_agg(DISTINCT COALESCE(a.scope_value, 'partout'), ', ')
              FROM public.staff_assignments a
              JOIN public.role_permissions rp ON rp.role_code = a.role_code
             WHERE a.user_id = _user_id AND rp.permission_code = p.code
               AND (a.expire_le IS NULL OR a.expire_le > now())),
           'partout'
         ) AS perimetre,
         (SELECT min(x) FROM (
            SELECT up.expire_le AS x FROM public.user_permissions up
             WHERE up.user_id = _user_id AND up.permission_code = p.code AND up.expire_le IS NOT NULL
            UNION ALL
            SELECT a.expire_le FROM public.staff_assignments a
              JOIN public.role_permissions rp ON rp.role_code = a.role_code
             WHERE a.user_id = _user_id AND rp.permission_code = p.code AND a.expire_le IS NOT NULL
          ) e) AS expire_le
    FROM public.permissions p
   ORDER BY p.position, p.code;
END;
$fn$;

REVOKE ALL ON FUNCTION public.permissions_effectives(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.permissions_effectives(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Le confinement : on n'accorde que ce qu'on détient
--
-- C'est la règle qui rend la délégation sûre, et son absence rendait toute la
-- séparation des rôles décorative.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.staff_set_permission(
  p_user_id uuid,
  p_code    text,
  p_accorde boolean,
  p_motif   text DEFAULT NULL,
  p_jours   integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier les droits.' USING ERRCODE = '42501';
  END IF;

  -- Personne ne se sert soi-meme. C'est la premiere porte de l'escalade, et la
  -- plus simple a fermer : un droit se demande, il ne se prend pas.
  IF p_user_id = v_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits. Demandez à un autre administrateur.'
      USING ERRCODE = '42501';
  END IF;

  -- On n'accorde que ce qu'on détient. Sans cette règle, déléguer le droit
  -- d'attribuer revenait à tout déléguer.
  IF p_accorde AND NOT public.has_permission(v_moi, p_code) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas accorder un droit que vous ne détenez pas vous-même (%).', p_code
      USING ERRCODE = '42501';
  END IF;

  IF char_length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de cette exception.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.user_permissions (user_id, permission_code, accorde, motif, granted_by, expire_le)
  VALUES (p_user_id, p_code, p_accorde, btrim(p_motif), v_moi,
          CASE WHEN p_jours IS NOT NULL THEN now() + make_interval(days => p_jours) END)
  ON CONFLICT (user_id, permission_code) DO UPDATE
    SET accorde = EXCLUDED.accorde, motif = EXCLUDED.motif,
        granted_by = EXCLUDED.granted_by, granted_at = now(),
        expire_le = EXCLUDED.expire_le;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, CASE WHEN p_accorde THEN 'grant_permission' ELSE 'revoke_permission' END,
          'user_permission', p_user_id::text,
          jsonb_build_object('droit', p_code, 'motif', btrim(p_motif),
                             'expire_dans_jours', p_jours));
END;
$fn$;

REVOKE ALL ON FUNCTION public.staff_set_permission(uuid, text, boolean, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_set_permission(uuid, text, boolean, text, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_assign_role(
  p_user_id     uuid,
  p_role_code   text,
  p_accorder    boolean DEFAULT true,
  p_scope_value text DEFAULT NULL,
  p_jours       integer DEFAULT NULL,
  p_motif       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi        uuid := auth.uid();
  v_mon_niveau smallint;
  v_niveau     smallint;
  v_manquants  text[];
  v_restants   integer;
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''attribuer un rôle.' USING ERRCODE = '42501';
  END IF;

  SELECT niveau INTO v_niveau FROM public.staff_roles WHERE code = p_role_code;
  IF v_niveau IS NULL THEN
    RAISE EXCEPTION 'Rôle inconnu : %.', p_role_code USING ERRCODE = '22023';
  END IF;

  IF p_user_id = v_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres rôles. Demandez à un autre administrateur.'
      USING ERRCODE = '42501';
  END IF;

  IF p_accorder THEN
    -- On n'attribue pas un rôle plus étendu que le sien. Sans ce contrôle,
    -- un délégué s'octroyait le rôle de super administrateur.
    SELECT COALESCE(max(niveau), 0) INTO v_mon_niveau
      FROM public.staff_assignments a
      JOIN public.staff_roles r ON r.code = a.role_code
     WHERE a.user_id = v_moi AND (a.expire_le IS NULL OR a.expire_le > now());
    IF public.has_role(v_moi, 'admin'::app_role) THEN
      v_mon_niveau := 100;
    END IF;

    IF v_niveau > v_mon_niveau THEN
      RAISE EXCEPTION 'Vous ne pouvez pas attribuer un rôle plus étendu que le vôtre.'
        USING ERRCODE = '42501';
    END IF;

    -- Et on n'attribue pas un rôle qui ouvrirait des droits qu'on n'a pas.
    -- Le rang seul ne suffit pas : deux rôles de même rang peuvent ouvrir des
    -- portes différentes.
    SELECT array_agg(rp.permission_code) INTO v_manquants
      FROM public.role_permissions rp
     WHERE rp.role_code = p_role_code
       AND NOT public.has_permission(v_moi, rp.permission_code);

    IF v_manquants IS NOT NULL AND array_length(v_manquants, 1) > 0 THEN
      RAISE EXCEPTION 'Ce rôle ouvre des droits que vous ne détenez pas : %.',
        array_to_string(v_manquants[1:3], ', ') USING ERRCODE = '42501';
    END IF;

    IF p_scope_value IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.service_cities WHERE slug = p_scope_value) THEN
      RAISE EXCEPTION 'Ville inconnue : %.', p_scope_value USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.staff_assignments
      (user_id, role_code, granted_by, scope_type, scope_value, expire_le, motif)
    VALUES (p_user_id, p_role_code, v_moi,
            CASE WHEN p_scope_value IS NULL THEN 'global' ELSE 'ville' END,
            p_scope_value,
            CASE WHEN p_jours IS NOT NULL THEN now() + make_interval(days => p_jours) END,
            NULLIF(btrim(COALESCE(p_motif, '')), ''))
    ON CONFLICT (user_id, role_code, COALESCE(scope_value, '*')) DO UPDATE
      SET granted_by = EXCLUDED.granted_by, granted_at = now(),
          expire_le = EXCLUDED.expire_le, motif = EXCLUDED.motif;
  ELSE
    -- Retirer le dernier super administrateur fermerait la console à tout le
    -- monde, sans moyen de la rouvrir depuis l'application.
    IF p_role_code = 'super_admin' THEN
      SELECT count(*) INTO v_restants
        FROM public.staff_assignments
       WHERE role_code = 'super_admin' AND user_id <> p_user_id
         AND (expire_le IS NULL OR expire_le > now());
      IF v_restants = 0 THEN
        RAISE EXCEPTION 'Il ne resterait aucun super administrateur : la console deviendrait inaccessible.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    DELETE FROM public.staff_assignments
     WHERE user_id = p_user_id AND role_code = p_role_code
       AND (p_scope_value IS NULL OR scope_value = p_scope_value);
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, CASE WHEN p_accorder THEN 'grant_role' ELSE 'revoke_role' END,
          'staff_assignment', p_user_id::text,
          jsonb_build_object('role', p_role_code, 'ville', p_scope_value,
                             'expire_dans_jours', p_jours,
                             'motif', NULLIF(btrim(COALESCE(p_motif, '')), '')));
END;
$fn$;

REVOKE ALL ON FUNCTION public.staff_assign_role(uuid, text, boolean, text, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_assign_role(uuid, text, boolean, text, integer, text) TO authenticated;

-- L'ancienne signature à trois arguments disparaît : elle contournait tous les
-- contrôles ci-dessus, et un appelant qui l'aurait gardée aurait gardé le trou.
DROP FUNCTION IF EXISTS public.staff_assign_role(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.staff_set_permission(uuid, text, boolean, text);

-- ---------------------------------------------------------------------------
-- 8. La réconciliation : ce qui prétend donner l'accès, et ce qui l'applique
--
-- La plateforme dit que l'accès vient de la matrice. Ce qui s'applique part
-- aussi du rôle hérité, qui se pose tout seul. Rien ne comparait les deux, donc
-- l'affirmation n'était pas vérifiable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gouvernance_reconciliation()
RETURNS TABLE (
  user_id       uuid,
  courriel      text,
  role_herite   text,
  roles_matrice text,
  ecart         text,
  gravite       text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter la gouvernance des accès.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH herite AS (
    SELECT ur.user_id, string_agg(ur.role::text, ', ' ORDER BY ur.role::text) AS roles
      FROM public.user_roles ur
     GROUP BY ur.user_id
  ),
  matrice AS (
    SELECT a.user_id, string_agg(DISTINCT a.role_code, ', ') AS roles
      FROM public.staff_assignments a
     WHERE a.expire_le IS NULL OR a.expire_le > now()
     GROUP BY a.user_id
  )
  SELECT u.id,
         u.email::text,
         COALESCE(h.roles, 'aucun'),
         COALESCE(m.roles, 'aucun'),
         CASE
           WHEN h.roles LIKE '%admin%' AND m.roles IS NULL
             THEN 'Tout par le rôle hérité, absent de la matrice'
           WHEN h.roles LIKE '%admin%' AND m.roles IS NOT NULL
             THEN 'Le rôle hérité rend la matrice sans effet : cette personne a tout'
           WHEN m.roles IS NOT NULL AND h.roles IS NULL
             THEN 'Rôles de la matrice sans rôle hérité, ce qui est l''état attendu'
           ELSE 'Sans objet'
         END,
         CASE
           WHEN h.roles LIKE '%admin%' AND m.roles IS NULL THEN 'a_verifier'
           WHEN h.roles LIKE '%admin%' THEN 'a_verifier'
           ELSE 'conforme'
         END
    FROM auth.users u
    LEFT JOIN herite h ON h.user_id = u.id
    LEFT JOIN matrice m ON m.user_id = u.id
   WHERE h.roles IS NOT NULL OR m.roles IS NOT NULL
   ORDER BY (h.roles LIKE '%admin%') DESC NULLS LAST, u.email;
END;
$fn$;

REVOKE ALL ON FUNCTION public.gouvernance_reconciliation() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gouvernance_reconciliation() TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Les échéances se referment toutes seules
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acces_purger_echus()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_roles integer;
  v_droits integer;
BEGIN
  -- On retire plutôt que de laisser traîner : une attribution échue qui reste
  -- en base se relit comme un droit en cours, et la revue des accès la compte.
  WITH retires AS (
    DELETE FROM public.staff_assignments
     WHERE expire_le IS NOT NULL AND expire_le <= now()
     RETURNING user_id, role_code
  )
  SELECT count(*) INTO v_roles FROM retires;

  WITH retires AS (
    DELETE FROM public.user_permissions
     WHERE expire_le IS NOT NULL AND expire_le <= now()
     RETURNING user_id, permission_code
  )
  SELECT count(*) INTO v_droits FROM retires;

  IF v_roles > 0 OR v_droits > 0 THEN
    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
    VALUES (NULL, 'acces_purger_echus', 'gouvernance', 'echeances',
            jsonb_build_object('roles', v_roles, 'droits', v_droits));
  END IF;

  RETURN jsonb_build_object('roles_retires', v_roles, 'droits_retires', v_droits);
END;
$fn$;

REVOKE ALL ON FUNCTION public.acces_purger_echus() FROM PUBLIC;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'akwaba-purge-acces-echus';
SELECT cron.schedule(
  'akwaba-purge-acces-echus',
  '10 4 * * *',
  $$SELECT public.acces_purger_echus()$$
);
