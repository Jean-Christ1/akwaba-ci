-- Le journal d'audit et les dossiers de shopper passent aussi par la matrice.
--
-- Trouves par la recette de la portee, pas par relecture, et de la meilleure
-- facon : une etape a echoue la ou elle devait passer.
--
-- Un moderateur de la matrice, sans role herite sur son compte, tranchait un
-- litige et se faisait refuser a la derniere ligne, celle qui ecrit la trace.
-- log_audit exigeait l'un des deux roles herites. Le geste entier echouait, et
-- le message parlait du journal d'audit, ce qui ne designait pas la cause.
--
-- La garde des colonnes privilegiees d'un dossier de shopper avait le meme
-- defaut, avec une consequence differente : elle laissait passer tout ancien
-- moderateur, sans regarder la ville, juste apres qu'on ait pris soin de
-- restreindre runner_set_status a la sienne. La restriction se contournait donc
-- par une ecriture directe.
--
-- Les deux corps sont repris de leur definition en base, seule la ligne de
-- controle change.

-- ---------------------------------------------------------------------------
-- Qui est du personnel
--
-- Ecrire au journal d'audit n'est pas un droit du catalogue : c'est la trace
-- que laisse un geste, quel qu'il soit. La question n'est donc pas « detient-il
-- tel droit », mais « fait-il partie du personnel ». Elle n'avait pas de
-- reponse ailleurs que dans les deux roles herites.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.est_du_personnel(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT _user_id IS NOT NULL AND (
    -- L'acces de secours herite, comme partout ailleurs.
    public.has_role(_user_id, 'admin'::app_role)
    OR public.has_role(_user_id, 'moderator'::app_role)
    -- Un role en cours, ou une exception nominative en cours.
    OR EXISTS (SELECT 1 FROM public.staff_assignments a
                WHERE a.user_id = _user_id
                  AND (a.expire_le IS NULL OR a.expire_le > now()))
    OR EXISTS (SELECT 1 FROM public.user_permissions u
                WHERE u.user_id = _user_id AND u.accorde
                  AND (u.expire_le IS NULL OR u.expire_le > now()))
  );
$fn$;

REVOKE ALL ON FUNCTION public.est_du_personnel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.est_du_personnel(uuid) TO authenticated;

COMMENT ON FUNCTION public.est_du_personnel(uuid) IS
  'Vrai si la personne detient un role ou une exception en cours. Sert la ou la question est « du personnel ? » et non « quel droit ? ».';


CREATE OR REPLACE FUNCTION public.log_audit(p_action text, p_entity text, p_entity_id text DEFAULT NULL::text, p_details jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Du personnel, et non plus l'un des deux roles herites : un moderateur
  -- de la matrice sans role herite voyait son geste echouer sur la ligne
  -- qui en ecrit la trace.
  IF NOT public.est_du_personnel(auth.uid()) THEN
    RAISE EXCEPTION 'Le journal d''audit est réservé au personnel de la plateforme.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (auth.uid(), left(p_action, 80), left(p_entity, 80), left(p_entity_id, 120),
          COALESCE(p_details, '{}'::jsonb));
END;
$function$
;


CREATE OR REPLACE FUNCTION public.guard_runner_profile_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Le moteur a la main : c'est lui qui compte les missions et calcule la note.
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Le droit de la matrice, et sa ville : sans elle, la restriction posee
  -- sur runner_set_status se contournait par une ecriture directe.
  IF public.has_scoped_permission(auth.uid(), 'shoppers.valider', NEW.city) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Le statut d''un profil shopper ne peut être modifié que par un modérateur.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.rating IS DISTINCT FROM OLD.rating THEN
    RAISE EXCEPTION 'La note d''un shopper est calculée par la plateforme et ne peut pas être modifiée manuellement.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.jobs_completed IS DISTINCT FROM OLD.jobs_completed THEN
    RAISE EXCEPTION 'Le nombre de missions est calculé par la plateforme et ne peut pas être modifié manuellement.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Le propriétaire d''un profil shopper ne peut pas être transféré.'
      USING ERRCODE = '42501';
  END IF;

  -- Nom et pièce d'identité sont ce que la modération a examiné. Les laisser
  -- modifiables après coup revient à valider un dossier vide. Le reste de la
  -- fiche, dont les moyens de contact, demeure librement modifiable.
  IF OLD.status = 'approved'::runner_status THEN
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'Votre nom a été vérifié : sa modification passe par la modération.'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.id_doc_url IS DISTINCT FROM OLD.id_doc_url THEN
      RAISE EXCEPTION 'Votre pièce d''identité a été vérifiée : son remplacement passe par la modération.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$
;
