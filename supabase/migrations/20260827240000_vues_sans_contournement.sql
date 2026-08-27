-- Les vues cessent d'être un chemin d'écriture, et la santé retrouve sa colonne.
--
-- Deux constats d'une sonde qui a tenté les écritures plutôt que de les
-- supposer.
--
-- Premier constat : deux vues s'exécutent avec les droits de leur propriétaire,
-- donc sans les politiques de sécurité des tables qu'elles lisent, et
-- accordent malgré cela INSERT, UPDATE et DELETE à tout compte connecté.
-- Les écritures sont bien refusées aujourd'hui, mais par les déclencheurs de
-- garde des colonnes, qui agissent indépendamment de la RLS. C'est une défense
-- qui tient par accident : elle protège les colonnes qu'elle connaît, et rien
-- ne dit qu'une suppression ou une colonne ajoutée demain rencontrera la même
-- barrière. Une vue de lecture ne doit accorder que la lecture.
--
-- Second constat : la vue notification_health a été redéfinie en même temps que
-- le routage multicanal, et elle a perdu au passage la colonne « abandonnees ».
-- L'écran de santé de l'exploitation la demande toujours : il affiche donc une
-- erreur au lieu de l'état de la file, sur l'écran même qui doit dire si les
-- messages partent.

-- ---------------------------------------------------------------------------
-- 1. Aucune vue n'accorde l'écriture
--
-- Ces vues sont toutes des lectures : agrégats, marchés, projections. Aucune
-- n'a jamais été destinée à recevoir une écriture, et le privilège venait du
-- GRANT large qui accompagne la création.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_vue text;
BEGIN
  FOR v_vue IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'v'
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.%I FROM anon, authenticated',
      v_vue
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. La santé de la file redevient lisible, et n'est lisible que par le personnel
--
-- La colonne perdue revient : une notification est abandonnée quand elle a
-- épuisé ses cinq tentatives. C'est le chiffre qui dit qu'on a cessé
-- d'essayer, donc celui qu'un exploitant regarde en premier.
--
-- La vue passe en mode appelant : elle applique alors la politique de
-- notification_outbox, qui réserve la lecture au personnel. Elle s'exécutait
-- jusqu'ici avec les droits de son propriétaire, donc en dehors de cette
-- politique.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS public.notification_health;

CREATE VIEW public.notification_health
WITH (security_invoker = on) AS
  SELECT
    COALESCE(channel, 'non route')                          AS canal,
    state::text                                             AS etat,
    count(*)::integer                                       AS nombre,
    -- Cinq tentatives epuisees : on a cesse d'essayer. C'est le chiffre que
    -- l'exploitant regarde en premier, et c'est celui qui avait disparu.
    count(*) FILTER (WHERE attempts >= 5)::integer          AS abandonnees,
    min(created_at)                                         AS plus_ancienne,
    max(created_at)                                         AS plus_recente
  FROM public.notification_outbox
  GROUP BY 1, 2;

-- La vue vient d'etre recreee : elle a donc repris les privileges par defaut
-- du schema, y compris l'ecriture. On les retire avant de rendre la lecture.
REVOKE ALL ON public.notification_health FROM anon, authenticated;
GRANT SELECT ON public.notification_health TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le marché reste hors politique, mais en lecture seule et pour un seul motif
--
-- open_errands_feed doit s'exécuter avec les droits de son propriétaire : elle
-- montre à un shopper habilité des courses qui ne sont pas les siennes, ce que
-- la politique de errands lui refuse par construction. C'est son objet même.
--
-- Sa garde tient donc entièrement dans sa clause : statut ouvert, aucun shopper
-- retenu, et appelant habilité. On la réaffirme ici pour que ce raisonnement
-- soit inscrit à côté du privilège, et la vue ne conserve que SELECT.
-- ---------------------------------------------------------------------------

COMMENT ON VIEW public.open_errands_feed IS
  'Marche des courses ouvertes. S''execute avec les droits du proprietaire, car elle montre a un shopper habilite des courses qui ne sont pas les siennes. Sa garde est dans sa clause WHERE : is_approved_runner(auth.uid()). Lecture seule.';

GRANT SELECT ON public.open_errands_feed TO authenticated;
