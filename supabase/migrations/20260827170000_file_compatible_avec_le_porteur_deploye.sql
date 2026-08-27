-- La file ne remet que ce que le porteur sait porter.
--
-- Les migrations précédentes ont ouvert la file à WhatsApp, au SMS et aux
-- destinataires sans compte. Le porteur déployé, lui, ne sait envoyer que des
-- courriels, et il lit l'adresse du compte : les fonctions serveur ne peuvent
-- pas être redéployées depuis ce poste, le jeton d'administration Supabase
-- étant refusé.
--
-- Sans garde-fou, le porteur en place réclamerait des messages WhatsApp, ne
-- trouverait pas d'adresse, échouerait cinq fois de suite, et les
-- condamnerait. On perdrait exactement ce que le routage venait de rendre
-- joignable.
--
-- Le porteur déclare donc ce qu'il sait porter. Celui qui ne déclare rien
-- reçoit des courriels, c'est-à-dire ce qu'il recevait avant. Les autres
-- canaux attendent, intacts, qu'un porteur capable les réclame.

DROP FUNCTION IF EXISTS public.notify_claim_batch(integer);

CREATE OR REPLACE FUNCTION public.notify_claim_batch(
  p_limit   integer DEFAULT 20,
  -- Ce que l'appelant sait porter. Par defaut le courriel seul : c'est le
  -- comportement du porteur en place, et l'hypothese prudente.
  p_canaux  text[] DEFAULT ARRAY['email']
)
RETURNS TABLE (
  id          uuid,
  canal       text,
  destination text,
  email       text,
  subject     text,
  body        text,
  event       text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  RETURN QUERY
  WITH pris AS (
    UPDATE public.notification_outbox o
    SET attempts = o.attempts + 1
    WHERE o.id IN (
      SELECT o2.id FROM public.notification_outbox o2
      WHERE o2.state = 'pending'::notification_state
        AND o2.attempts < 5
        AND COALESCE(o2.channel, 'email') = ANY (COALESCE(p_canaux, ARRAY['email']))
      ORDER BY o2.created_at
      LIMIT GREATEST(COALESCE(p_limit, 20), 1)
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.user_id, o.channel, o.destination, o.subject, o.body, o.event
  )
  SELECT p.id,
         COALESCE(p.channel, 'email'),
         COALESCE(p.destination, u.email::text),
         -- Le porteur en place lit cette colonne et rien d'autre. Elle porte
         -- donc la destination quand le canal est le courriel, y compris pour
         -- un destinataire sans compte, faute de quoi un avis a un partenaire
         -- partirait vers NULL.
         CASE WHEN COALESCE(p.channel, 'email') = 'email'
              THEN COALESCE(p.destination, u.email::text)
              ELSE u.email::text END,
         p.subject, p.body, p.event
  FROM pris p
  LEFT JOIN auth.users u ON u.id = p.user_id;
END;
$fn$;

COMMENT ON FUNCTION public.notify_claim_batch(integer, text[]) IS
  'Reclame un lot de notifications, limite aux canaux que l''appelant declare savoir porter.';

-- ---------------------------------------------------------------------------
-- Un message sans destination ne part pas, et ne se consume pas non plus
--
-- Le porteur ne peut rien faire d'une ligne sans adresse ni numero. La lui
-- remettre lui ferait bruler cinq tentatives pour rien, et effacerait la trace
-- de ce qu'on n'a pas su envoyer.
-- ---------------------------------------------------------------------------

UPDATE public.notification_outbox
   SET state = 'skipped'::notification_state,
       last_error = 'aucune destination : rien a porter'
 WHERE state = 'pending'::notification_state
   AND COALESCE(btrim(destination), '') = ''
   AND user_id IS NULL;
