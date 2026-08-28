-- Le périmètre reconnaît la ville par son nom comme par son identifiant.
--
-- Une attribution restreinte enregistre l'identifiant de la ville, « bouake ».
-- Une course enregistre son nom, « Bouaké ». La comparaison portait sur les
-- deux chaînes telles quelles : elles ne sont jamais égales, l'accent suffit à
-- les séparer.
--
-- Conséquence, mesurée avant correction : un responsable limité à Bouaké ne
-- voyait ni Abidjan, ce qui était voulu, ni Bouaké, ce qui ne l'était pas. Le
-- périmètre ne restreignait pas, il fermait.
--
-- C'est le quatrième endroit de ce dépôt où le même piège se referme, après le
-- barème tarifaire, les codes promotionnels et les modes de course. La règle
-- vaut donc d'être écrite une fois pour toutes : partout où une ville est
-- comparée, elle se reconnaît par son identifiant ou par son nom.

CREATE OR REPLACE FUNCTION public.meme_ville(_a text, _b text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT _a IS NOT NULL AND _b IS NOT NULL
     AND (
       lower(_a) = lower(_b)
       OR EXISTS (
         SELECT 1 FROM public.service_cities c
          WHERE (c.slug = _a OR lower(c.name) = lower(_a))
            AND (c.slug = _b OR lower(c.name) = lower(_b))
       )
     );
$fn$;

REVOKE ALL ON FUNCTION public.meme_ville(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.meme_ville(text, text) TO authenticated;

COMMENT ON FUNCTION public.meme_ville(text, text) IS
  'Deux désignations de la même ville, par identifiant ou par nom. Le piège s''est déjà refermé quatre fois dans ce dépôt.';

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
       -- Une attribution globale suffit, sinon il faut la bonne ville, quelle
       -- que soit la facon dont elle est designee de part et d'autre.
       OR EXISTS (
         SELECT 1 FROM public.staff_assignments a
           JOIN public.role_permissions rp ON rp.role_code = a.role_code
          WHERE a.user_id = _user_id AND rp.permission_code = _code
            AND (a.expire_le IS NULL OR a.expire_le > now())
            AND (a.scope_type = 'global' OR public.meme_ville(a.scope_value, _scope_value))
       )
     );
$fn$;

REVOKE ALL ON FUNCTION public.has_scoped_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scoped_permission(uuid, text, text) TO authenticated;
