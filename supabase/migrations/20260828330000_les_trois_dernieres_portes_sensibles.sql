-- Les trois dernières portes sensibles.
--
-- L'audit ne signale plus que celles-là : des droits marqués sensibles dans le
-- catalogue, affichés « accordé » dans la console, et que rien ne consultait.
--
-- Deux se branchent sur une porte qui existait déjà et regardait le rôle
-- hérité. La troisième, la suspension d'un compte, n'avait aucune porte du
-- tout : le droit décrivait un geste que l'application ne savait pas faire.
-- Le laisser au catalogue en le disant « accordé » serait promettre un pouvoir
-- qui n'existe pas ; le retirer effacerait un besoin réel. On écrit donc le
-- geste.

-- ---------------------------------------------------------------------------
-- 1. Les moyens de paiement
--
-- La table n'est lue que par l'écran de réglages de la console : rien dans le
-- parcours client ne la consulte. La politique reste donc fermée comme elle
-- l'était, seul le contrôle change de nature.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins manage payment providers" ON public.payment_providers;
CREATE POLICY "Admins manage payment providers" ON public.payment_providers
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'paiements.fournisseurs'))
  WITH CHECK (public.has_permission(auth.uid(), 'paiements.fournisseurs'));

-- ---------------------------------------------------------------------------
-- 2. La correction d'une course
--
-- La garde des colonnes privilégiées laissait passer l'ancien rôle. Elle
-- consulte désormais le droit que la console annonce, ce qui rend enfin vraie
-- la phrase du catalogue : « corriger une course » est un droit sensible, et
-- non un attribut du rôle hérité.
--
-- Le corps est repris tel quel de la définition en base, et seule la ligne de
-- contrôle change. La garde raisonne par liste blanche, updated_at seule libre,
-- et porte une exception d'anonymisation par cascade : la réécrire de mémoire
-- l'aurait retournée en liste noire et aurait ouvert toutes les colonnes qu'un
-- oubli aurait laissées hors de la liste.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Les seules colonnes qu'une écriture directe peut changer. Tout le reste
  -- appartient au moteur.
  v_libres  text[] := ARRAY['updated_at'];
  v_avant   jsonb;
  v_apres   jsonb;
  v_touchee text;
BEGIN
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Anonymisation par cascade : le client disparaît, la course et sa trace
  -- comptable demeurent. Aucun montant, aucun statut, aucune affectation ne
  -- bouge, sans quoi on retombe dans le cas général ci-dessous.
  IF NEW.customer_id IS NULL AND OLD.customer_id IS NOT NULL
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
     AND NEW.runner_id IS NOT DISTINCT FROM OLD.runner_id
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.commission_amount IS NOT DISTINCT FROM OLD.commission_amount
     AND NEW.runner_payout IS NOT DISTINCT FROM OLD.runner_payout THEN
    RETURN NEW;
  END IF;

  -- Le droit de la matrice, et non plus le seul rôle hérité : ce que la console
  -- affiche doit être ce que le serveur applique.
  IF public.has_permission(auth.uid(), 'courses.corriger') THEN
    RETURN NEW;
  END IF;

  v_avant := to_jsonb(OLD);
  v_apres := to_jsonb(NEW);

  SELECT cle
  INTO v_touchee
  FROM jsonb_object_keys(v_apres) AS cle
  WHERE NOT (cle = ANY (v_libres))
    AND v_apres -> cle IS DISTINCT FROM v_avant -> cle
  LIMIT 1;

  IF v_touchee IS NOT NULL THEN
    -- Le message nomme la colonne : un développeur qui heurte la garde doit
    -- savoir laquelle, sans avoir à deviner.
    RAISE EXCEPTION
      'Les montants, le statut, l''affectation et les preuves d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement (colonne « % »).',
      v_touchee
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Suspendre un compte
--
-- Le droit existait au catalogue, le geste nulle part. Suspendre se faisait
-- donc à la main dans la base, hors de toute trace applicative.
--
-- Ce que la suspension fait : elle ferme l'accès. Ce qu'elle ne fait pas, et le
-- catalogue le dit déjà : elle n'efface rien. Une suspension se lève, un
-- effacement non.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS suspendu_le    timestamptz,
  ADD COLUMN IF NOT EXISTS suspendu_par   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspendu_motif text;

COMMENT ON COLUMN public.profiles.suspendu_le IS
  'Date de suspension du compte. NULL = compte actif. La suspension ferme l''accès, elle n''efface rien.';

CREATE OR REPLACE FUNCTION public.compte_suspendre(
  p_user_id uuid,
  p_suspendre boolean,
  p_motif text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
BEGIN
  IF NOT public.has_permission(v_moi, 'utilisateurs.suspendre') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de suspendre un compte.' USING ERRCODE = '42501';
  END IF;

  -- Se suspendre soi-même n'a aucun sens et ferme la console à celui qui le
  -- fait, sans qu'il puisse revenir en arrière.
  IF p_user_id = v_moi THEN
    RAISE EXCEPTION 'Vous ne pouvez pas suspendre votre propre compte.' USING ERRCODE = '42501';
  END IF;

  IF p_suspendre AND char_length(btrim(COALESCE(p_motif, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de la suspension.' USING ERRCODE = '22023';
  END IF;

  -- Suspendre quelqu'un de plus habilité que soi reviendrait à neutraliser sa
  -- hiérarchie : c'est la même escalade que retirer son rôle.
  IF p_suspendre AND public.has_permission(p_user_id, 'roles.attribuer')
     AND NOT public.has_permission(v_moi, 'roles.attribuer') THEN
    RAISE EXCEPTION 'Vous ne pouvez pas suspendre un compte qui attribue les droits.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles SET
    suspendu_le = CASE WHEN p_suspendre THEN now() END,
    suspendu_par = CASE WHEN p_suspendre THEN v_moi END,
    suspendu_motif = CASE WHEN p_suspendre THEN btrim(p_motif) END,
    updated_at = now()
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte introuvable.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, CASE WHEN p_suspendre THEN 'compte_suspendre' ELSE 'compte_reactiver' END,
          'profile', p_user_id::text,
          jsonb_build_object('motif', NULLIF(btrim(COALESCE(p_motif, '')), '')));

  RETURN jsonb_build_object('id', p_user_id, 'suspendu', p_suspendre);
END;
$fn$;

REVOKE ALL ON FUNCTION public.compte_suspendre(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compte_suspendre(uuid, boolean, text) TO authenticated;

-- Un compte suspendu ne publie plus de course. Le reste de ses données lui
-- reste accessible : suspendre n'est pas effacer, et il doit pouvoir consulter
-- ce qui le concerne pour contester.
CREATE OR REPLACE FUNCTION public.guard_course_compte_suspendu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = NEW.customer_id AND p.suspendu_le IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Ce compte est suspendu et ne peut pas publier de course. Contactez le support.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_course_compte_suspendu ON public.errands;
CREATE TRIGGER guard_course_compte_suspendu
  BEFORE INSERT ON public.errands
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_course_compte_suspendu();

-- La colonne de suspension se lit, elle ne s'écrit pas directement : sinon
-- n'importe qui lèverait sa propre suspension d'un simple UPDATE sur son propre
-- profil, que la politique « Users can update own profile » autorise.
--
-- Rien n'est à retirer ici : la migration du consentement a déjà remplacé le
-- privilège de table par un GRANT colonne par colonne
-- (display_name, phone, locale, avatar_url, updated_at). Les colonnes ajoutées
-- ci-dessus n'y figurent pas, donc personne ne les écrit en direct. Le contrôle
-- ci-dessous le vérifie plutôt que de le supposer : si un futur GRANT sur la
-- table entière revenait, la migration échouerait au lieu de laisser la porte
-- ouverte en silence.
DO $verif$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND privilege_type = 'UPDATE'
       AND grantee = 'authenticated'
       AND column_name IN ('suspendu_le', 'suspendu_par', 'suspendu_motif')
  ) THEN
    RAISE EXCEPTION 'Les colonnes de suspension sont modifiables directement : la suspension se leverait elle-meme.';
  END IF;
END;
$verif$;
