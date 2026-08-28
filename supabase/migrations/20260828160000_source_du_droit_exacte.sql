-- La source d'un droit doit être la bonne, pas la première trouvée.
--
-- permissions_effectives regardait l'accès de secours avant la matrice. Une
-- personne qui détient les deux, ce qui est le cas courant puisqu'un rôle
-- hérité « admin » crée l'attribution « super_admin » par déclencheur, était
-- donc annoncée comme tenant tout du secours. C'était faux, et la conséquence
-- pratique l'était aussi : on lui aurait cherché un accès de secours à retirer
-- alors que son droit venait d'un rôle parfaitement visible.
--
-- L'ordre juste est celui du retrait. Pour retirer un droit, on commence par
-- la matrice, qui l'explique dans la quasi-totalité des cas ; le secours n'est
-- la source que lorsqu'il est le seul à ouvrir, et c'est précisément ce cas-là
-- qu'il faut voir, puisque rien d'autre ne le montre.
--
-- Ce cas existe vraiment : le déclencheur ne recopie le rôle hérité qu'à
-- l'insertion. Retirer ensuite l'attribution miroir laisse le rôle hérité seul,
-- ouvrant les trente-quatre permissions sans qu'aucune ligne de la matrice ne
-- l'explique.

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
  WITH par_role AS (
    SELECT rp.permission_code,
           string_agg(DISTINCT sr.libelle, ', ') AS roles,
           string_agg(DISTINCT COALESCE(a.scope_value, 'partout'), ', ') AS villes,
           min(a.expire_le) AS echeance
      FROM public.staff_assignments a
      JOIN public.role_permissions rp ON rp.role_code = a.role_code
      JOIN public.staff_roles sr ON sr.code = a.role_code
     WHERE a.user_id = _user_id
       AND (a.expire_le IS NULL OR a.expire_le > now())
     GROUP BY rp.permission_code
  ),
  nominatif AS (
    SELECT up.permission_code, up.accorde, up.motif, up.expire_le
      FROM public.user_permissions up
     WHERE up.user_id = _user_id
       AND (up.expire_le IS NULL OR up.expire_le > now())
  ),
  secours AS (
    SELECT public.has_role(_user_id, 'admin'::app_role) AS actif
  )
  SELECT p.code, p.libelle, p.categorie, p.sensible,
         public.has_permission(_user_id, p.code),
         CASE
           WHEN nm.permission_code IS NOT NULL AND NOT nm.accorde THEN 'retrait'
           WHEN nm.permission_code IS NOT NULL AND nm.accorde THEN 'nominatif'
           -- La matrice avant le secours : c'est par elle qu'on retire.
           WHEN pr.permission_code IS NOT NULL THEN 'role'
           WHEN s.actif THEN 'secours'
           ELSE 'aucune'
         END,
         CASE
           WHEN nm.permission_code IS NOT NULL THEN nm.motif
           WHEN pr.permission_code IS NOT NULL THEN pr.roles
           WHEN s.actif THEN 'Rôle hérité admin : ouvre tout, sans figurer dans la matrice.'
           ELSE NULL
         END,
         COALESCE(pr.villes, 'partout'),
         LEAST(nm.expire_le, pr.echeance)
    FROM public.permissions p
    CROSS JOIN secours s
    LEFT JOIN par_role pr ON pr.permission_code = p.code
    LEFT JOIN nominatif nm ON nm.permission_code = p.code
   ORDER BY p.position, p.code;
END;
$fn$;

REVOKE ALL ON FUNCTION public.permissions_effectives(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.permissions_effectives(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Le déclencheur ne recopie qu'à l'insertion
--
-- Changer le rôle hérité d'une personne, de « user » à « admin », ne créait
-- aucune attribution : la personne obtenait tout par le secours, invisible.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS sync_legacy_staff_role ON public.user_roles;
CREATE TRIGGER sync_legacy_staff_role
  AFTER INSERT OR UPDATE OF role ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_legacy_staff_role();

COMMENT ON FUNCTION public.sync_legacy_staff_role() IS
  'Recopie le role herite dans la matrice, a l''insertion comme au changement. La reconciliation montre ce qui reste desaligne.';
