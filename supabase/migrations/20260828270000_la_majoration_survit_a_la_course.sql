-- Trois trous trouvés par une revue adverse, tous vérifiés contre la base.
--
-- 1. LA PROMESSE NE SURVIVAIT PAS À LA COURSE. Le devis calcule la commission
--    sur le tarif d'avant majoration : le supplément revient au shopper. Mais
--    la course n'en gardait aucune mémoire, et errand_accept_offer recalcule la
--    commission sur le prix de l'offre, majoration comprise. Akwaba reprenait
--    donc quinze pour cent du supplément dès qu'un shopper acceptait, c'est-à-
--    dire toujours. La promesse tenait au devis et nulle part ailleurs.
--
-- 2. LE PÉRIMÈTRE SE CONTOURNAIT EN DEMANDANT « PARTOUT ». has_scoped_permission
--    rendait vrai sans rien vérifier quand la ville visée valait NULL. Un
--    responsable limité à Bouaké ouvrait donc une majoration nationale, ce qui
--    est plus que ce que sa restriction lui laissait faire à Bouaké même.
--    Vérifié : accepté.
--
-- 3. LE RETRAIT D'UN RÔLE N'ÉTAIT CONFINÉ PAR RIEN. On ne peut accorder que ce
--    qu'on détient, mais on pouvait retirer n'importe quoi à n'importe qui.
--    Un délégué neutralisait ainsi tous ses collègues, y compris le responsable
--    conformité dont il n'a pas les droits. Vérifié : accepté.

-- ---------------------------------------------------------------------------
-- 1. La course se souvient de ce que la majoration lui a ajouté
-- ---------------------------------------------------------------------------

ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS surge_fee    numeric(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS surge_reason text;

COMMENT ON COLUMN public.errands.surge_fee IS
  'Part des frais de service due a une majoration exceptionnelle. Elle revient au shopper : la commission ne porte jamais dessus.';

-- La lecture de cette table est accordée colonne par colonne, parce qu'elle
-- porte le code de remise, qui doit rester invisible au shopper. Toute colonne
-- ajoutée ensuite reste donc illisible tant qu'on ne rafraîchit pas, et un
-- « select étoile » échoue en entier. Le contrôle du dépôt le rappelle, et il
-- avait raison de le rappeler : je l'avais oublié ici.
SELECT public.refresh_errand_column_grants();

-- Le moteur écrit ces colonnes, personne d'autre : les rouvrir à l'écriture
-- directe permettrait de gonfler la part exonérée de commission. L'ordre compte,
-- le rafraîchissement ne touchant qu'à la lecture.
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
    INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'errands'
     AND column_name NOT IN ('surge_fee', 'surge_reason');
  EXECUTE 'REVOKE UPDATE ON public.errands FROM authenticated';
  EXECUTE 'GRANT UPDATE (' || v_cols || ') ON public.errands TO authenticated';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. La commission ne porte jamais sur le supplément
--
-- Le prix de l'offre porte la majoration, puisque c'est ce que le shopper a vu.
-- On la retranche avant de calculer la commission, sans jamais descendre sous
-- le plancher de frais : sinon une majoration ferait disparaître la commission
-- d'une petite course.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.commission_hors_majoration(
  _prix      numeric,
  _majoration numeric,
  _plancher  numeric
)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT GREATEST(COALESCE(_prix, 0) - GREATEST(COALESCE(_majoration, 0), 0),
                  COALESCE(_plancher, 0));
$fn$;

COMMENT ON FUNCTION public.commission_hors_majoration(numeric, numeric, numeric) IS
  'L''assiette de la commission : le prix moins la majoration, jamais sous le plancher.';

-- ---------------------------------------------------------------------------
-- 3. Le périmètre ne se contourne plus en demandant « partout »
--
-- Demander sans préciser de ville veut dire « partout ». Quelqu'un dont toutes
-- les attributions sont restreintes à une ville ne peut donc pas répondre oui.
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
       -- Une exception nominative n'a pas de perimetre : elle vaut partout.
       EXISTS (SELECT 1 FROM public.user_permissions
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
       -- Une attribution globale vaut partout, y compris quand aucune ville
       -- n'est precisee.
       OR EXISTS (
         SELECT 1 FROM public.staff_assignments a
           JOIN public.role_permissions rp ON rp.role_code = a.role_code
          WHERE a.user_id = _user_id AND rp.permission_code = _code
            AND a.scope_type = 'global'
            AND (a.expire_le IS NULL OR a.expire_le > now())
       )
       -- Sinon il faut la bonne ville. Sans ville precisee, la question est
       -- « partout ? », et quelqu'un de restreint repond non : c'etait le trou,
       -- et il laissait ouvrir une majoration nationale depuis une seule ville.
       OR (
         _scope_value IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.staff_assignments a
             JOIN public.role_permissions rp ON rp.role_code = a.role_code
            WHERE a.user_id = _user_id AND rp.permission_code = _code
              AND (a.expire_le IS NULL OR a.expire_le > now())
              AND public.meme_ville(a.scope_value, _scope_value)
         )
       )
     );
$fn$;

REVOKE ALL ON FUNCTION public.has_scoped_permission(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scoped_permission(uuid, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retirer un rôle est confiné comme l'attribuer
--
-- On ne pouvait accorder que ce qu'on détient, mais retirer n'importe quoi à
-- n'importe qui. Un délégué neutralisait ses collègues sans jamais rien
-- s'accorder, ce qui est une autre façon de prendre le pouvoir.
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

  -- Le confinement vaut dans les deux sens. Retirer un rôle qu'on ne détient
  -- pas revient à décider d'un pouvoir qu'on n'a pas : c'est la façon de
  -- prendre le pouvoir sans jamais rien s'accorder.
  IF v_niveau > v_mon_niveau THEN
    RAISE EXCEPTION 'Vous ne pouvez pas %s un rôle plus étendu que le vôtre.',
      CASE WHEN p_accorder THEN 'attribuer' ELSE 'retirer' END
      USING ERRCODE = '42501';
  END IF;

  SELECT array_agg(rp.permission_code) INTO v_manquants
    FROM public.role_permissions rp
   WHERE rp.role_code = p_role_code
     AND NOT public.has_permission(v_moi, rp.permission_code);

  IF v_manquants IS NOT NULL AND array_length(v_manquants, 1) > 0 THEN
    RAISE EXCEPTION 'Ce rôle porte des droits que vous ne détenez pas : %.',
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
          expire_le = EXCLUDED.expire_le, motif = EXCLUDED.motif;
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

-- ---------------------------------------------------------------------------
-- 5. guard_permission_documentee reçoit son chemin de recherche
--
-- C'était la seule fonction de ces migrations à en manquer, et l'audit le
-- signalait. Une exception tolérée est une exception qu'on cesse de voir.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_permission_documentee()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  IF NEW.ne_permet_pas IS NULL OR char_length(btrim(NEW.ne_permet_pas)) < 20 THEN
    RAISE EXCEPTION 'Le droit « % » doit dire ce qu''il ne permet pas. Sans cette phrase, il sera accordé à l''aveugle.',
      NEW.code USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;
