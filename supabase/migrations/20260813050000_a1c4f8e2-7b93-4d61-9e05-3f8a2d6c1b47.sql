-- Lot A : durcissement de runner_profiles
--
-- Corrige deux failles confirmees en base par l'audit du 13 aout 2026 :
--   1. Contournement du controle KYC : les politiques INSERT et UPDATE ne
--      contraignaient pas la colonne status, donc un utilisateur pouvait
--      s'auto-approuver shopper et acceder au flux des courses ouvertes.
--   2. Fuite de donnees personnelles : la politique SELECT exposait la ligne
--      entiere (telephone, whatsapp, piece d'identite) de tout shopper approuve
--      a n'importe quel utilisateur connecte.
--
-- Migration additive : aucune colonne, table ou fonctionnalite supprimee.

-- ---------------------------------------------------------------------------
-- 1. Creation d'un profil : statut toujours pending, reputation toujours a zero
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Runner creates own profile" ON public.runner_profiles;

CREATE POLICY "Runner creates own profile"
  ON public.runner_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND char_length(full_name) >= 2
    AND char_length(full_name) <= 120
    AND char_length(phone) >= 6
    AND char_length(phone) <= 30
    AND status = 'pending'::runner_status
    AND rating = 0
    AND jobs_completed = 0
  );

-- ---------------------------------------------------------------------------
-- 2. Mise a jour : le proprietaire ne peut pas modifier les colonnes privilegiees
--
-- Une politique RLS ne sait pas restreindre une colonne precise en UPDATE :
-- le WITH CHECK porte sur la ligne resultante, pas sur le delta. On compare
-- donc explicitement l'ancienne et la nouvelle valeur dans un trigger.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_runner_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Appels serveur (service_role, migrations, taches planifiees) : auth.uid()
  -- est nul. La validation d'acces a deja eu lieu en amont.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Les moderateurs et administrateurs pilotent la validation depuis le
  -- back-office : ils gardent le droit de faire evoluer le statut.
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

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_runner_profile_privileged_columns() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_runner_profiles_guard ON public.runner_profiles;
CREATE TRIGGER trg_runner_profiles_guard
  BEFORE UPDATE ON public.runner_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_runner_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- 3. Lecture : plus d'exposition des donnees personnelles a tout le monde
--
-- Ont acces a la ligne complete : le proprietaire, les admins et moderateurs,
-- et le client d'une course sur laquelle ce shopper est effectivement assigne
-- (necessaire pour l'appel et le WhatsApp pendant la mission).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Runner reads own profile" ON public.runner_profiles;

CREATE POLICY "Runner profile read access"
  ON public.runner_profiles
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.errands e
      WHERE e.runner_id = runner_profiles.user_id
        AND e.customer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Vitrine publique des shoppers approuves
--
-- Expose uniquement les colonnes non sensibles, ce qui permet d'afficher une
-- carte shopper (nom, ville, vehicule, note, missions) sans jamais divulguer
-- le telephone, le whatsapp ni la piece d'identite.
--
-- La vue est volontairement en security definer (comportement par defaut) :
-- elle doit pouvoir presenter les profils approuves a un utilisateur qui n'a
-- pas le droit de lire la table sous-jacente. Le filtrage par colonne ET par
-- statut est porte par la definition de la vue elle-meme.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.runner_public_profiles AS
  SELECT
    user_id,
    full_name,
    city,
    zones,
    vehicle,
    bio,
    photo_url,
    rating,
    jobs_completed,
    is_online
  FROM public.runner_profiles
  WHERE status = 'approved'::runner_status;

COMMENT ON VIEW public.runner_public_profiles IS
  'Colonnes publiques des shoppers approuves. Ne contient jamais phone, whatsapp ni id_doc_url.';

GRANT SELECT ON public.runner_public_profiles TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Reduction de la surface d'attaque
--
-- Le role anon n'a aucune raison de toucher aux profils shopper : la table
-- contient des donnees personnelles et une piece d'identite.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.runner_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.runner_profiles TO authenticated;
GRANT ALL ON public.runner_profiles TO service_role;
