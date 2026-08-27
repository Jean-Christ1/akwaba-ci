-- Vérification d'identité du shopper : majorité, pièce, selfie.
--
-- Un shopper reçoit l'argent des achats d'un inconnu, entre chez lui et
-- manipule ses effets. La plateforme ne vérifiait rien : le dossier portait
-- deux adresses de fichiers, `id_doc_url` et `photo_url`, que personne
-- n'était tenu de renseigner et qu'aucune règle n'obligeait à contrôler. Un
-- modérateur pouvait valider un dossier vide.
--
-- Surtout, rien ne relevait la date de naissance. La plateforme ne pouvait pas
-- savoir si elle confiait de l'argent et une adresse privée à un mineur, et
-- elle ne pouvait pas non plus démontrer le contraire.
--
-- Trois règles, appliquées par le serveur :
--   1. Un dossier ne se valide pas sans date de naissance, pièce et selfie.
--   2. Un dossier ne se valide pas si la personne a moins de dix-huit ans.
--   3. Un dossier ne se valide pas si la pièce est périmée.
--
-- Aucun contrôle biométrique automatique n'est mis en place : aucun
-- prestataire n'est contractualisé, et prétendre comparer un visage à une
-- pièce sans en avoir les moyens produirait une garantie fausse. Le
-- rapprochement est fait par un humain, et sa décision est inscrite.
--
-- Données conservées : la stricte nécessité. La date de naissance sert à
-- prouver la majorité, le type et l'échéance de la pièce à savoir quand la
-- redemander. Ni le numéro de la pièce, ni aucune donnée biométrique dérivée
-- ne sont stockés.

ALTER TABLE public.runner_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth          date,
  ADD COLUMN IF NOT EXISTS id_document_type       text
    CHECK (id_document_type IS NULL OR id_document_type IN
      ('cni', 'passeport', 'permis', 'attestation_identite', 'carte_consulaire')),
  ADD COLUMN IF NOT EXISTS id_document_expires_on date,
  ADD COLUMN IF NOT EXISTS selfie_url             text,
  ADD COLUMN IF NOT EXISTS identity_submitted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS identity_reviewed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS identity_reviewed_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS identity_review_note   text;

-- Une date de naissance dans le futur, ou celle d'une personne de cent
-- cinquante ans, est une faute de saisie, pas une identité.
ALTER TABLE public.runner_profiles
  DROP CONSTRAINT IF EXISTS runner_profiles_naissance_plausible;
ALTER TABLE public.runner_profiles
  ADD CONSTRAINT runner_profiles_naissance_plausible
  CHECK (date_of_birth IS NULL
         OR (date_of_birth > date '1900-01-01' AND date_of_birth < date '2100-01-01'));

-- ---------------------------------------------------------------------------
-- La majorité, calculée au moment où on la demande
--
-- Une contrainte CHECK ne convient pas : elle serait évaluée à l'écriture, et
-- un dossier déposé la veille des dix-huit ans resterait valide pour toujours
-- sans jamais être réexaminé. La question se pose à chaque décision.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.est_majeur(p_naissance date, p_le date DEFAULT current_date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_naissance IS NOT NULL AND p_naissance <= (p_le - interval '18 years')::date;
$$;

COMMENT ON FUNCTION public.est_majeur(date, date) IS
  'Vrai si la personne a dix-huit ans revolus a la date consideree.';

-- ---------------------------------------------------------------------------
-- Ce qui manque à un dossier pour pouvoir être validé
--
-- Rendre la liste plutôt qu'un simple refus : un modérateur qui refuse doit
-- pouvoir dire au candidat ce qu'il lui reste à fournir.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_identity_gaps(p_runner public.runner_profiles)
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN p_runner.date_of_birth IS NULL THEN 'date de naissance' END,
    CASE WHEN p_runner.date_of_birth IS NOT NULL AND NOT public.est_majeur(p_runner.date_of_birth)
         THEN 'majorite non atteinte' END,
    CASE WHEN COALESCE(btrim(p_runner.id_doc_url), '') = '' THEN 'piece d''identite' END,
    CASE WHEN p_runner.id_document_type IS NULL THEN 'type de piece' END,
    CASE WHEN p_runner.id_document_expires_on IS NOT NULL
              AND p_runner.id_document_expires_on < current_date
         THEN 'piece perimee' END,
    CASE WHEN COALESCE(btrim(p_runner.selfie_url), '') = '' THEN 'selfie' END
  ], NULL);
$$;

-- ---------------------------------------------------------------------------
-- Le candidat dépose son dossier
--
-- Le refus de la minorité est prononcé ici, au dépôt, et non seulement à la
-- validation : dire non tout de suite vaut mieux que laisser quelqu'un
-- attendre une décision qui ne peut pas être favorable.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_submit_identity(
  p_date_of_birth   date,
  p_document_type   text,
  p_document_expires date,
  p_id_doc_url      text,
  p_selfie_url      text
)
RETURNS public.runner_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_profil public.runner_profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté.' USING ERRCODE = '42501';
  END IF;

  IF p_date_of_birth IS NULL THEN
    RAISE EXCEPTION 'Votre date de naissance est obligatoire.' USING ERRCODE = '22023';
  END IF;

  IF NOT public.est_majeur(p_date_of_birth) THEN
    RAISE EXCEPTION 'Il faut avoir dix-huit ans révolus pour devenir shopper.'
      USING ERRCODE = '22023';
  END IF;

  IF p_document_type IS NULL THEN
    RAISE EXCEPTION 'Indiquez le type de pièce d''identité fournie.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(btrim(p_id_doc_url), '') = '' THEN
    RAISE EXCEPTION 'La pièce d''identité est obligatoire.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(btrim(p_selfie_url), '') = '' THEN
    RAISE EXCEPTION 'Le selfie est obligatoire : il permet de rapprocher votre visage de la pièce.'
      USING ERRCODE = '22023';
  END IF;

  IF p_document_expires IS NOT NULL AND p_document_expires < current_date THEN
    RAISE EXCEPTION 'Cette pièce est périmée. Fournissez-en une en cours de validité.'
      USING ERRCODE = '22023';
  END IF;

  -- Le moteur pose son marqueur : un dépôt de dossier remet le statut à
  -- l'examen, ce que la garde de colonnes interdit à un utilisateur ordinaire.
  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.runner_profiles SET
    date_of_birth          = p_date_of_birth,
    id_document_type       = p_document_type,
    id_document_expires_on = p_document_expires,
    id_doc_url             = btrim(p_id_doc_url),
    selfie_url             = btrim(p_selfie_url),
    identity_submitted_at  = now(),
    -- Un nouveau dépôt annule l'examen précédent : les pièces ont changé.
    identity_reviewed_at   = NULL,
    identity_reviewed_by   = NULL,
    identity_review_note   = NULL,
    status                 = 'pending'::runner_status
  WHERE user_id = v_uid
  RETURNING * INTO v_profil;

  PERFORM set_config('app.errand_engine', 'off', true);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Créez d''abord votre dossier de shopper.' USING ERRCODE = 'P0002';
  END IF;

  -- L'insertion est directe, et non via log_audit : cette fonction-la refuse
  -- tout appelant qui n'est pas du personnel, et c'est ici le candidat qui
  -- agit. Passer par elle faisait echouer chaque depot de dossier.
  --
  -- Ni la date de naissance ni les adresses de fichiers ne sont recopiees au
  -- journal : il est lisible par tout le personnel, et ces donnees n'ont pas a
  -- y figurer. Le type de piece suffit a retracer la demarche.
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'submit_identity', 'runner_profile', v_profil.id::text,
          jsonb_build_object('type_piece', p_document_type,
                             'echeance', p_document_expires,
                             'majeur', true));

  RETURN v_profil;
END;
$$;

-- ---------------------------------------------------------------------------
-- La validation refuse un dossier incomplet
--
-- runner_set_status validait sans rien regarder. Un modérateur pressé, ou
-- distrait, pouvait approuver un dossier vide, et rien dans la base ne s'y
-- opposait. Le contrôle passe côté serveur : refuser dépend désormais des
-- pièces, pas de l'attention de celui qui clique.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_set_status(
  p_runner_id uuid,
  p_status    runner_status,
  p_reason    text DEFAULT NULL
)
RETURNS public.runner_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avant   public.runner_profiles;
  v_apres   public.runner_profiles;
  v_manques text[];
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'moderator'::app_role)) THEN
    RAISE EXCEPTION 'Seul le personnel de la plateforme change le statut d''un shopper.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_avant FROM public.runner_profiles WHERE id = p_runner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dossier de shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_avant.status = p_status THEN
    -- Rien ne change : ne pas inscrire une décision qui n'a pas eu lieu.
    RETURN v_avant;
  END IF;

  -- Suspendre ou refuser prive quelqu'un de son revenu : le motif est exigé,
  -- alors qu'une validation se suffit à elle-même.
  IF p_status IN ('suspended'::runner_status, 'rejected'::runner_status)
     AND char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de la suspension ou du refus.' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'approved'::runner_status THEN
    v_manques := public.runner_identity_gaps(v_avant);
    IF array_length(v_manques, 1) > 0 THEN
      RAISE EXCEPTION 'Ce dossier ne peut pas être validé. Il manque : %.',
        array_to_string(v_manques, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.runner_profiles
  SET status = p_status,
      -- La validation ou le refus est l'examen d'identité : on inscrit qui a
      -- rapproché le visage de la pièce, et quand.
      identity_reviewed_at = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN now() ELSE identity_reviewed_at END,
      identity_reviewed_by = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN auth.uid() ELSE identity_reviewed_by END,
      identity_review_note = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN NULLIF(btrim(COALESCE(p_reason, '')), '') ELSE identity_review_note END
  WHERE id = p_runner_id
  RETURNING * INTO v_apres;

  PERFORM public.log_audit('set_status', 'runner_profile', p_runner_id::text,
    jsonb_build_object(
      'avant', v_avant.status,
      'apres', p_status,
      'motif', COALESCE(NULLIF(btrim(p_reason), ''), 'non precise')
    ));

  RETURN v_apres;
END;
$$;

-- ---------------------------------------------------------------------------
-- Une pièce périmée retire l'habilitation
--
-- Sans cela, un dossier validé une fois le reste indéfiniment : la pièce
-- expire, le contrôle n'est plus à jour, et personne ne s'en aperçoit.
-- L'ordonnanceur existant appelle taches_planifiees() ; cette tâche s'y range.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_expire_identity_documents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n integer;
BEGIN
  WITH perimes AS (
    UPDATE public.runner_profiles
    SET status = 'pending'::runner_status
    WHERE status = 'approved'::runner_status
      AND id_document_expires_on IS NOT NULL
      AND id_document_expires_on < current_date
    RETURNING id
  )
  SELECT count(*)::integer INTO v_n FROM perimes;

  IF v_n > 0 THEN
    PERFORM public.log_audit('identity_expired', 'runner_profile', 'lot',
      jsonb_build_object('dossiers', v_n));
  END IF;

  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.runner_submit_identity(date, text, date, text, text)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.runner_submit_identity(date, text, date, text, text)
  TO authenticated;
REVOKE ALL ON FUNCTION public.runner_expire_identity_documents() FROM anon, authenticated;

-- La nouvelle colonne de selfie et la date de naissance ne doivent pas devenir
-- modifiables directement : la garde de colonnes du dossier shopper les couvre
-- deja par son principe de liste blanche, verifie apres cette migration.
