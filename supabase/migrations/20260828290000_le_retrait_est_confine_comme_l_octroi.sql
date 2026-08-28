-- Trois trous de gouvernance, tous trouvés par une revue adverse et vérifiés
-- contre la base avant correction.
--
-- 1. NEUTRALISER VALAIT ESCALADE, ET SANS RETOUR. Le confinement de
--    staff_set_permission ne portait que sur la branche « accorder ». Un
--    délégué appelait donc staff_set_permission(super_admin, 'roles.attribuer',
--    false, 'motif') : le retrait nominatif prime sur tout, y compris sur le
--    rôle hérité, et le super administrateur perdait le droit d'attribuer.
--    Répété sur chaque compte, le délégué devenait le seul à le détenir, et
--    personne ne pouvait le lui reprendre depuis l'application, puisque les
--    deux fonctions d'attribution exigent précisément ce droit. Vérifié :
--    accepté, et le super administrateur neutralisé.
--
--    Prendre le pouvoir en retirant celui des autres est une escalade comme
--    une autre. La règle devient donc symétrique : on ne touche, dans un sens
--    comme dans l'autre, qu'à un droit qu'on détient soi-même.
--
-- 2. LA REVUE CONFIRMAIT CE QU'ELLE N'AVAIT PAS MONTRÉ. Depuis que la clé
--    porte la ville, une personne peut détenir le même rôle sur trois villes.
--    La revue affichait trois lignes identiques et un seul clic les confirmait
--    toutes : deux accès que personne n'a regardés étaient déclarés relus, au
--    nom du relecteur. Vérifié : deux attributions, un clic, zéro restante.
--
-- 3. LE CONFINEMENT IGNORAIT LE PÉRIMÈTRE. Il vérifiait ce qu'on détient,
--    jamais où on le détient. Un délégué limité à Bouaké confiait donc un rôle
--    global à un tiers, et lisait Abidjan par personne interposée.

-- ---------------------------------------------------------------------------
-- 1. Le retrait nominatif est confiné comme l'octroi
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
  v_moi      uuid := auth.uid();
  v_restants integer;
BEGIN
  IF NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de modifier les droits.' USING ERRCODE = '42501';
  END IF;

  IF p_user_id = v_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas modifier vos propres droits. Demandez à un autre administrateur.'
      USING ERRCODE = '42501';
  END IF;

  -- La règle vaut dans les deux sens. Accorder un droit qu'on n'a pas serait
  -- se l'inventer ; le retirer à quelqu'un qui l'a serait décider d'un pouvoir
  -- qu'on n'exerce pas. Les deux reviennent à dépasser son propre périmètre.
  IF NOT public.has_permission(v_moi, p_code) THEN
    RAISE EXCEPTION 'Vous ne pouvez pas % un droit que vous ne détenez pas vous-même (%).',
      CASE WHEN p_accorde THEN 'accorder' ELSE 'retirer' END, p_code
      USING ERRCODE = '42501';
  END IF;

  IF char_length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de cette exception.' USING ERRCODE = '22023';
  END IF;

  -- Retirer le droit d'attribuer au dernier qui le détient ferme la
  -- gouvernance sur elle-même : plus personne ne peut rien changer depuis
  -- l'application, y compris pour revenir en arrière.
  IF NOT p_accorde AND p_code = 'roles.attribuer' THEN
    SELECT count(*) INTO v_restants
      FROM auth.users u
     WHERE u.id <> p_user_id
       AND public.has_permission(u.id, 'roles.attribuer');
    IF v_restants = 0 THEN
      RAISE EXCEPTION 'Il ne resterait personne pour attribuer les droits : la gouvernance se fermerait sur elle-même.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  INSERT INTO public.user_permissions (user_id, permission_code, accorde, motif, granted_by, expire_le)
  VALUES (p_user_id, p_code, p_accorde, btrim(p_motif), v_moi,
          CASE WHEN p_jours IS NOT NULL THEN now() + make_interval(days => p_jours) END)
  ON CONFLICT (user_id, permission_code) DO UPDATE
    SET accorde = EXCLUDED.accorde, motif = EXCLUDED.motif,
        granted_by = EXCLUDED.granted_by, granted_at = now(),
        expire_le = EXCLUDED.expire_le, revu_le = NULL, revu_par = NULL;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, CASE WHEN p_accorde THEN 'grant_permission' ELSE 'revoke_permission' END,
          'user_permission', p_user_id::text,
          jsonb_build_object('droit', p_code, 'motif', btrim(p_motif),
                             'expire_dans_jours', p_jours));
END;
$fn$;

REVOKE ALL ON FUNCTION public.staff_set_permission(uuid, text, boolean, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_set_permission(uuid, text, boolean, text, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. La revue confirme une attribution, pas toutes celles qui lui ressemblent
-- ---------------------------------------------------------------------------

-- La colonne « perimetre » s'ajoute au milieu du type de retour : PostgreSQL
-- refuse de changer le type d'une fonction existante, il faut donc la retirer
-- d'abord. Aucun appelant ne s'interrompt : la migration est atomique.
DROP FUNCTION IF EXISTS public.acces_a_revoir(integer, integer);

CREATE OR REPLACE FUNCTION public.acces_a_revoir(p_jours_sensibles integer DEFAULT 90,
                                                 p_jours_courants  integer DEFAULT 365)
RETURNS TABLE (
  genre        text,
  user_id      uuid,
  courriel     text,
  intitule     text,
  code         text,
  -- Sans cette colonne, trois attributions du même rôle sur trois villes
  -- s'affichaient à l'identique, et le relecteur ne pouvait pas les distinguer.
  perimetre    text,
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
  SELECT 'role'::text,
         a.user_id,
         u.email::text,
         r.libelle,
         a.role_code,
         COALESCE(a.scope_value, 'partout'),
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

  SELECT 'exception'::text,
         up.user_id,
         u.email::text,
         p.libelle,
         up.permission_code,
         'partout'::text,
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

   ORDER BY 7 DESC, 11 DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.acces_a_revoir(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acces_a_revoir(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.acces_confirmer_revue(
  p_genre       text,
  p_user_id     uuid,
  p_code        text,
  p_scope_value text DEFAULT NULL
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

  IF p_user_id = v_moi THEN
    RAISE EXCEPTION 'Vos propres accès doivent être relus par quelqu''un d''autre.'
      USING ERRCODE = '42501';
  END IF;

  IF p_genre = 'role' THEN
    -- Une attribution à la fois. Confirmer d'un geste toutes les villes d'un
    -- rôle déclarerait relus des accès que personne n'a regardés, et le
    -- compteur des accès jamais relus deviendrait faux là où il compte le plus.
    UPDATE public.staff_assignments
       SET revu_le = now(), revu_par = v_moi
     WHERE user_id = p_user_id AND role_code = p_code
       AND COALESCE(scope_value, '*') = COALESCE(p_scope_value, '*');
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
          jsonb_build_object('genre', p_genre, 'code', p_code, 'perimetre', p_scope_value));

  RETURN jsonb_build_object('genre', p_genre, 'code', p_code,
                            'perimetre', COALESCE(p_scope_value, 'partout'),
                            'revu_le', now());
END;
$fn$;

DROP FUNCTION IF EXISTS public.acces_confirmer_revue(text, uuid, text);
REVOKE ALL ON FUNCTION public.acces_confirmer_revue(text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.acces_confirmer_revue(text, uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le confinement regarde aussi où l'on détient ce qu'on donne
--
-- Il vérifiait ce qu'on détient, jamais où. Un délégué limité à Bouaké
-- confiait donc un rôle global à un tiers, et lisait Abidjan par personne
-- interposée. La vérification passe désormais par le périmètre visé.
-- ---------------------------------------------------------------------------

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

  SELECT COALESCE(max(niveau), 0) INTO v_mon_niveau
    FROM public.staff_assignments a
    JOIN public.staff_roles r ON r.code = a.role_code
   WHERE a.user_id = v_moi AND (a.expire_le IS NULL OR a.expire_le > now());
  IF public.has_role(v_moi, 'admin'::app_role) THEN
    v_mon_niveau := 100;
  END IF;

  IF v_niveau > v_mon_niveau THEN
    RAISE EXCEPTION 'Vous ne pouvez pas % un rôle plus étendu que le vôtre.',
      CASE WHEN p_accorder THEN 'attribuer' ELSE 'retirer' END
      USING ERRCODE = '42501';
  END IF;

  -- Le périmètre visé entre dans la vérification : confier un rôle « partout »
  -- demande de détenir ses droits partout, et non seulement dans sa ville.
  SELECT array_agg(rp.permission_code) INTO v_manquants
    FROM public.role_permissions rp
   WHERE rp.role_code = p_role_code
     AND NOT public.has_scoped_permission(v_moi, rp.permission_code, p_scope_value);

  IF v_manquants IS NOT NULL AND array_length(v_manquants, 1) > 0 THEN
    RAISE EXCEPTION 'Ce rôle porte des droits que vous ne détenez pas %s : %.',
      CASE WHEN p_scope_value IS NULL THEN 'partout' ELSE 'dans cette ville' END,
      array_to_string(v_manquants[1:3], ', ') USING ERRCODE = '42501';
  END IF;

  IF p_accorder THEN
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
          expire_le = EXCLUDED.expire_le, motif = EXCLUDED.motif,
          revu_le = NULL, revu_par = NULL;
  ELSE
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
