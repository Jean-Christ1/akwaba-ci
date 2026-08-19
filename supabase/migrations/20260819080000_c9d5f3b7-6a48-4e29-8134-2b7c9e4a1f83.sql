-- ---------------------------------------------------------------------------
-- Ce qui déclenche les tâches périodiques.
--
-- Deux mécanismes complets attendent depuis leur écriture quelque chose qui les
-- appelle, et rien ne les appelle :
--
--   - les courses programmées. Un client peut demander qu'une course revienne
--     chaque semaine, la fonction qui les republie existe et fonctionne, mais
--     personne ne l'exécute. La programmation est donc une promesse vide.
--   - la file d'attente des notifications. Les messages y sont déposés par les
--     déclencheurs métier, la fonction de bordure sait les envoyer, mais elle
--     n'est jamais appelée. Les messages s'accumulent sans partir.
--
-- Aucune de ces deux absences ne se voit : rien n'échoue, rien ne remonte
-- d'erreur. Le client attend simplement une course qui ne viendra pas, ou un
-- message qui ne partira jamais.
--
-- Cette migration installe le déclencheur qui manquait.
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------------------------------------------------------------------------
-- 1. Les courses programmées.
--
-- L'ordonnanceur est appelé directement, sans passer par une fonction de
-- bordure : toute sa logique vit déjà dans la base, où elle est
-- transactionnelle. Un détour par HTTP n'ajouterait qu'un secret partagé à
-- gérer et un point de panne de plus.
--
-- La fonction n'est exécutable que par postgres et service_role, et la tâche
-- planifiée s'exécute sous postgres : aucun droit n'est élargi ici.
--
-- Toutes les quinze minutes : une programmation est datée à l'heure près, pas
-- à la minute, donc un quart d'heure de latence est sans effet visible, et
-- c'est autant de réveils inutiles évités.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'akwaba-courses-programmees') THEN
    PERFORM cron.unschedule('akwaba-courses-programmees');
  END IF;

  PERFORM cron.schedule(
    'akwaba-courses-programmees',
    '*/15 * * * *',
    'SELECT public.errand_schedules_run_due(50)'
  );
END
$$;

-- ---------------------------------------------------------------------------
-- 2. La file d'attente des notifications.
--
-- Celle-ci ne peut pas être drainée depuis la base : envoyer un courriel ou un
-- message Telegram demande des clés d'API qui n'ont rien à faire dans
-- PostgreSQL. L'appel passe donc par la fonction de bordure, qui les détient.
--
-- Cet appel exige deux valeurs propres au projet : l'adresse des fonctions de
-- bordure et le secret partagé qui les protège. Aucune des deux n'est écrite
-- ici : une adresse ou un secret inscrits dans une migration se retrouveraient
-- dans l'historique Git. Elles sont lues dans le coffre du projet.
--
-- Si l'une manque, la tâche n'est pas créée et la migration le dit. Elle ne
-- crée surtout pas une tâche qui échouerait toutes les cinq minutes en
-- silence, ni ne devine une adresse.
--
-- Pour l'armer, déposer les deux secrets dans le coffre puis rejouer ce bloc :
--   SELECT vault.create_secret('https://<ref>.supabase.co/functions/v1',
--                              'akwaba_functions_url');
--   SELECT vault.create_secret('<le CRON_SECRET des fonctions de bordure>',
--                              'akwaba_cron_secret');
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT decrypted_secret INTO v_url
  FROM vault.decrypted_secrets WHERE name = 'akwaba_functions_url';

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets WHERE name = 'akwaba_cron_secret';

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'akwaba-notifications') THEN
    PERFORM cron.unschedule('akwaba-notifications');
  END IF;

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE NOTICE
      'File de notifications non planifiée : secrets « akwaba_functions_url » et « akwaba_cron_secret » absents du coffre. Le reste de la migration est appliqué.';
    RETURN;
  END IF;

  -- Toutes les cinq minutes : un message d'accompagnement de course perd son
  -- sens s'il arrive une demi-heure après l'évènement qu'il annonce.
  PERFORM cron.schedule(
    'akwaba-notifications',
    '*/5 * * * *',
    format(
      $cmd$SELECT net.http_post(
             url := %L,
             headers := jsonb_build_object(
               'Content-Type', 'application/json',
               'x-cron-secret', %L
             ),
             body := '{}'::jsonb,
             timeout_milliseconds := 20000
           )$cmd$,
      rtrim(v_url, '/') || '/send-notifications',
      v_secret
    )
  );
END
$$;

-- ---------------------------------------------------------------------------
-- 3. De quoi constater qu'elles tournent.
--
-- Une tâche planifiée qui s'arrête ne se remarque pas : il n'y a pas d'erreur,
-- seulement une absence. Cette vue rend le dernier passage et son issue
-- lisibles depuis la console d'exploitation.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.taches_planifiees()
RETURNS TABLE (
  tache          text,
  frequence      text,
  active         boolean,
  dernier_debut  timestamptz,
  dernier_statut text,
  dernier_message text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.start_time,
    d.status::text,
    left(d.return_message, 200)
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.start_time, r.status, r.return_message
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON true
  WHERE j.jobname LIKE 'akwaba-%'
    AND (public.has_role(auth.uid(), 'admin'::app_role)
         OR public.has_role(auth.uid(), 'moderator'::app_role))
  ORDER BY j.jobname;
$$;

COMMENT ON FUNCTION public.taches_planifiees() IS
  'Dernier passage des tâches planifiées Akwaba. Réservé au personnel.';

REVOKE ALL ON FUNCTION public.taches_planifiees() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.taches_planifiees() TO authenticated;
