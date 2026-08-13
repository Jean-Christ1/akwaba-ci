-- ---------------------------------------------------------------------------
-- La garde des profils shopper empêchait la clôture de toute course.
--
-- Défaut constaté en exécutant un parcours complet contre la base : à la
-- clôture, errand_confirm_payment incrémente le compteur de missions du
-- shopper, et errand_rate_runner recalcule sa note. Ces deux colonnes sont
-- justement celles que la garde protège, et cette garde ne reconnaissait pas
-- le marqueur que le moteur pose avant d'écrire.
--
-- Résultat : « Le nombre de missions est calculé par la plateforme et ne peut
-- pas être modifié manuellement » remontait au client qui confirmait son
-- paiement. Aucune course ne pouvait donc être clôturée, ni aucun shopper
-- payé. La garde protégeait la plateforme d'elle-même.
--
-- Le marqueur reste le seul chemin d'écriture : il est posé par les fonctions
-- SECURITY DEFINER du moteur et par elles seules, dans leur propre
-- transaction. Un utilisateur ne peut pas le poser depuis l'extérieur.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_runner_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Le moteur a la main : c'est lui qui compte les missions et calcule la note.
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'moderator'::app_role) THEN
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
$$;

-- ---------------------------------------------------------------------------
-- Contrôle de non-régression, exécuté à la migration.
--
-- Une garde qui bloque le moteur ne se voit pas à la lecture : elle se
-- découvre le jour où un client n'arrive plus à payer. On vérifie donc ici que
-- toute garde posée sur une table que le moteur écrit sait s'effacer devant
-- lui.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_sourde text[];
BEGIN
  SELECT array_agg(p.proname ORDER BY p.proname)
  INTO v_sourde
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'guard_errand_privileged_columns',
      'guard_runner_profile_privileged_columns',
      'guard_errand_offer_columns'
    )
    AND p.prosrc NOT LIKE '%app.errand_engine%';

  IF v_sourde IS NOT NULL THEN
    RAISE EXCEPTION 'Ces gardes ignorent le marqueur du moteur et bloqueraient la clôture : %',
      array_to_string(v_sourde, ', ');
  END IF;
END
$$;
