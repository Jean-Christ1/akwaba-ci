-- La revue des accès : ce qu'on a accordé et qu'on n'a jamais relu.
--
-- Un droit s'accorde en trois secondes, pour une raison qui paraît évidente sur
-- le moment. Il se retire rarement, parce que rien ne le rappelle. Au bout d'un
-- an, personne ne sait plus qui détient quoi, ni pourquoi.
--
-- Le mécanisme qui manquait n'est pas un contrôle de plus : c'est une date. Une
-- attribution porte désormais la date à laquelle quelqu'un l'a relue et l'a
-- confirmée. Sans elle, la question « ce droit est-il encore justifié ? » ne se
-- pose jamais, faute d'un endroit où la poser.
--
-- Ce que la revue ne fait pas, et c'est délibéré : elle ne retire rien toute
-- seule. Retirer automatiquement un droit sensible parce que personne ne l'a
-- relu fermerait la console à quelqu'un au pire moment, un dimanche, sans que
-- personne comprenne pourquoi. Elle montre, elle ne tranche pas.

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS revu_le  timestamptz,
  ADD COLUMN IF NOT EXISTS revu_par uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.user_permissions
  ADD COLUMN IF NOT EXISTS revu_le  timestamptz,
  ADD COLUMN IF NOT EXISTS revu_par uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.staff_assignments.revu_le IS
  'Date a laquelle quelqu''un a relu cette attribution et l''a confirmee. NULL = jamais relue.';

-- ---------------------------------------------------------------------------
-- Ce qui attend une relecture
--
-- Le délai n'est pas le même pour tout : un droit sensible se relit tous les
-- trois mois, les autres une fois l'an. Un droit qui expire de lui-même n'a pas
-- besoin d'être relu, il se referme.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acces_a_revoir(p_jours_sensibles integer DEFAULT 90,
                                                 p_jours_courants  integer DEFAULT 365)
RETURNS TABLE (
  genre        text,
  user_id      uuid,
  courriel     text,
  intitule     text,
  code         text,
  sensible     boolean,
  motif        text,
  accorde_le   timestamptz,
  revu_le      timestamptz,
  jours_depuis integer,
  echeance     timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT public.has_permission(auth.uid(), 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de mener la revue des accès.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  -- Les attributions de rôle. Un rôle est sensible dès qu'il porte un droit
  -- sensible : c'est par le rôle qu'on obtient le droit, pas malgré lui.
  SELECT 'role'::text,
         a.user_id,
         u.email::text,
         r.libelle,
         a.role_code,
         EXISTS (SELECT 1 FROM public.role_permissions rp
                   JOIN public.permissions p ON p.code = rp.permission_code
                  WHERE rp.role_code = a.role_code AND p.sensible),
         a.motif,
         a.granted_at,
         a.revu_le,
         EXTRACT(day FROM now() - COALESCE(a.revu_le, a.granted_at))::integer,
         a.expire_le
    FROM public.staff_assignments a
    JOIN public.staff_roles r ON r.code = a.role_code
    JOIN auth.users u ON u.id = a.user_id
   WHERE a.expire_le IS NULL
     AND COALESCE(a.revu_le, a.granted_at) < now() - make_interval(days =>
           CASE WHEN EXISTS (SELECT 1 FROM public.role_permissions rp
                               JOIN public.permissions p ON p.code = rp.permission_code
                              WHERE rp.role_code = a.role_code AND p.sensible)
                THEN p_jours_sensibles ELSE p_jours_courants END)

  UNION ALL

  -- Les exceptions nominatives. Elles sont, par nature, ce qui se justifie le
  -- moins bien avec le temps : elles ont été faites pour un cas particulier.
  SELECT 'exception'::text,
         up.user_id,
         u.email::text,
         p.libelle,
         up.permission_code,
         p.sensible,
         up.motif,
         up.granted_at,
         up.revu_le,
         EXTRACT(day FROM now() - COALESCE(up.revu_le, up.granted_at))::integer,
         up.expire_le
    FROM public.user_permissions up
    JOIN public.permissions p ON p.code = up.permission_code
    JOIN auth.users u ON u.id = up.user_id
   WHERE up.accorde
     AND up.expire_le IS NULL
     AND COALESCE(up.revu_le, up.granted_at) < now() - make_interval(days =>
           CASE WHEN p.sensible THEN p_jours_sensibles ELSE p_jours_courants END)

   ORDER BY 6 DESC, 10 DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.acces_a_revoir(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acces_a_revoir(integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Confirmer une relecture
--
-- Relire, c'est dire « je l'ai regardé et il est toujours justifié ». Ce geste
-- se trace comme une attribution, parce qu'il en porte la responsabilité : dans
-- un an, quelqu'un demandera qui a laissé ce droit ouvert.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.acces_confirmer_revue(
  p_genre   text,
  p_user_id uuid,
  p_code    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
  v_n   integer;
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de mener la revue des accès.'
      USING ERRCODE = '42501';
  END IF;

  -- Relire ses propres droits n'est pas une relecture : c'est se donner raison.
  IF p_user_id = v_moi THEN
    RAISE EXCEPTION 'Vos propres accès doivent être relus par quelqu''un d''autre.'
      USING ERRCODE = '42501';
  END IF;

  IF p_genre = 'role' THEN
    UPDATE public.staff_assignments
       SET revu_le = now(), revu_par = v_moi
     WHERE user_id = p_user_id AND role_code = p_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSIF p_genre = 'exception' THEN
    UPDATE public.user_permissions
       SET revu_le = now(), revu_par = v_moi
     WHERE user_id = p_user_id AND permission_code = p_code;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    RAISE EXCEPTION 'Genre inconnu : %.', p_genre USING ERRCODE = '22023';
  END IF;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'Cet accès n''existe plus : il a peut-être déjà été retiré.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'acces_confirmer_revue', 'gouvernance', p_user_id::text,
          jsonb_build_object('genre', p_genre, 'code', p_code));

  RETURN jsonb_build_object('genre', p_genre, 'code', p_code, 'revu_le', now());
END;
$fn$;

REVOKE ALL ON FUNCTION public.acces_confirmer_revue(text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acces_confirmer_revue(text, uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- L'état de la gouvernance en un coup d'oeil
--
-- Trois chiffres qu'on veut voir avant d'ouvrir quoi que ce soit : combien de
-- comptes ont des droits, combien attendent une relecture, et combien tiennent
-- tout d'un accès de secours que la matrice n'explique pas.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gouvernance_sante()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter la gouvernance des accès.'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'comptes_avec_droits', (
      SELECT count(DISTINCT user_id)::integer FROM public.staff_assignments
       WHERE expire_le IS NULL OR expire_le > now()
    ),
    'attributions', (
      SELECT count(*)::integer FROM public.staff_assignments
       WHERE expire_le IS NULL OR expire_le > now()
    ),
    'exceptions', (
      SELECT count(*)::integer FROM public.user_permissions
       WHERE accorde AND (expire_le IS NULL OR expire_le > now())
    ),
    'retraits_nominatifs', (
      SELECT count(*)::integer FROM public.user_permissions
       WHERE NOT accorde AND (expire_le IS NULL OR expire_le > now())
    ),
    'restreintes_par_ville', (
      SELECT count(*)::integer FROM public.staff_assignments
       WHERE scope_type = 'ville' AND (expire_le IS NULL OR expire_le > now())
    ),
    'avec_echeance', (
      SELECT count(*)::integer FROM public.staff_assignments WHERE expire_le > now()
    ),
    'jamais_relues', (
      SELECT count(*)::integer FROM public.staff_assignments
       WHERE revu_le IS NULL AND expire_le IS NULL
    ),
    -- Le chiffre qu'on regarde en premier : ceux qui tiennent tout d'un accès
    -- de secours, sans qu'aucune ligne de la matrice ne l'explique.
    'acces_de_secours_seuls', (
      SELECT count(*)::integer FROM public.user_roles ur
       WHERE ur.role = 'admin'::app_role
         AND NOT EXISTS (
           SELECT 1 FROM public.staff_assignments a
            WHERE a.user_id = ur.user_id
              AND (a.expire_le IS NULL OR a.expire_le > now())
         )
    ),
    'droits_au_catalogue', (SELECT count(*)::integer FROM public.permissions),
    'droits_sensibles', (SELECT count(*)::integer FROM public.permissions WHERE sensible),
    'droits_non_documentes', (
      SELECT count(*)::integer FROM public.permissions WHERE ne_permet_pas IS NULL
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.gouvernance_sante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gouvernance_sante() TO authenticated;
