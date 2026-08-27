-- Joindre les gens là où ils sont.
--
-- Toutes les notifications partaient par courriel, et seulement par courriel.
-- En Côte d'Ivoire, WhatsApp est le canal courant ; beaucoup de comptes n'ont
-- pas d'adresse consultée, certains n'en ont pas du tout. Une notification qui
-- part vers une adresse que personne ne lit n'a pas été envoyée, elle a été
-- perdue avec un accusé de succès.
--
-- Ce qui change ici :
--   1. chacun dit où il veut être joint, et le consentement est daté ;
--   2. la base résout un canal et une destination au moment du dépôt ;
--   3. si le canal préféré n'est pas joignable, la chaîne de repli s'applique,
--      et la raison du repli est inscrite.
--
-- Ce qui ne change pas : aucun fournisseur WhatsApp ni SMS n'est contractualisé
-- à ce jour. La migration ne fait donc pas semblant d'envoyer. Elle prépare la
-- destination et le canal ; l'expédition reste au portage, qui dit lui-même
-- quand il n'a pas de clé. Le jour où un contrat existe, rien n'est à refaire
-- côté base.

-- ---------------------------------------------------------------------------
-- 1. Où chacun veut être joint
--
-- Le numéro WhatsApp est distinct du téléphone : beaucoup de gens ont un numéro
-- d'appel et un autre pour WhatsApp, et écrire dans le mauvais ne joint
-- personne.
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp            text,
  ADD COLUMN IF NOT EXISTS canal_prefere       text NOT NULL DEFAULT 'whatsapp'
    CHECK (canal_prefere IN ('whatsapp', 'sms', 'email', 'in_app')),
  -- Le consentement est daté, pas coché. Une case sans date ne prouve rien le
  -- jour où quelqu'un demande quand il a accepté.
  ADD COLUMN IF NOT EXISTS whatsapp_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sms_consent_at      timestamptz,
  ADD COLUMN IF NOT EXISTS email_consent_at    timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Le dépôt porte désormais un canal et une destination
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS destination text,
  ADD COLUMN IF NOT EXISTS repli_motif text;

-- Le canal etait un type enumere ne connaissant qu'une seule valeur, « email ».
-- Un type enumere ne s'administre pas : ajouter un canal demanderait une
-- migration, et sa valeur ne serait meme pas utilisable dans la meme
-- transaction. Le canal devient du texte contraint, comme les roles
-- d'exploitation, pour la meme raison.
--
-- La conversion est sure : la file est vide au moment ou cette migration passe,
-- et la seule valeur possible, « email », se relit telle quelle en texte.
DO $conv$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'notification_outbox'
       AND column_name = 'channel' AND udt_name = 'notification_channel'
  ) THEN
    ALTER TABLE public.notification_outbox
      ALTER COLUMN channel DROP DEFAULT,
      ALTER COLUMN channel TYPE text USING channel::text;
    ALTER TABLE public.notification_outbox
      ALTER COLUMN channel SET DEFAULT 'email';
  END IF;
END $conv$;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_canal_connu;
ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_canal_connu
  CHECK (channel IS NULL OR channel IN ('whatsapp', 'sms', 'email', 'in_app'));

-- ---------------------------------------------------------------------------
-- 3. Le routage
--
-- Une préférence ne suffit pas : il faut une destination valide et un
-- consentement. Sans l'un des deux, on descend la chaîne plutôt que de laisser
-- tomber le message. Le dernier recours est « in_app », qui ne demande ni
-- numéro ni adresse : la personne le verra en ouvrant l'application, ce qui
-- vaut mieux que rien.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_route(p_user_id uuid)
RETURNS TABLE (canal text, destination text, motif text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profil    public.profiles;
  v_email     text;
  v_whatsapp  text;
  v_sms       text;
  v_chaine    text[];
  v_c         text;
  v_raisons   text[] := ARRAY[]::text[];
BEGIN
  SELECT * INTO v_profil FROM public.profiles WHERE id = p_user_id;
  SELECT u.email::text INTO v_email FROM auth.users u WHERE u.id = p_user_id;

  -- Un numero de moins de huit chiffres n'est pas un numero : mieux vaut le
  -- traiter comme absent que d'ecrire dans le vide.
  v_whatsapp := NULLIF(btrim(COALESCE(v_profil.whatsapp, '')), '');
  IF v_whatsapp IS NOT NULL AND length(regexp_replace(v_whatsapp, '\D', '', 'g')) < 8 THEN
    v_whatsapp := NULL;
  END IF;

  v_sms := NULLIF(btrim(COALESCE(v_profil.phone, '')), '');
  IF v_sms IS NOT NULL AND length(regexp_replace(v_sms, '\D', '', 'g')) < 8 THEN
    v_sms := NULL;
  END IF;

  -- La preference vient en tete, le reste suit dans l'ordre de portee en Cote
  -- d'Ivoire. « in_app » ferme toujours la marche : il ne peut pas echouer.
  --
  -- Le canal prefere est retire de la suite, sans quoi il serait examine deux
  -- fois et son motif de repli inscrit en double, ce qui rend le journal
  -- illisible pour qui cherche pourquoi un message n'est pas parti.
  v_chaine := ARRAY[COALESCE(v_profil.canal_prefere, 'whatsapp')]
            || ARRAY(SELECT c FROM unnest(ARRAY['whatsapp', 'sms', 'email', 'in_app']) AS c
                      WHERE c IS DISTINCT FROM COALESCE(v_profil.canal_prefere, 'whatsapp'));

  FOREACH v_c IN ARRAY v_chaine LOOP
    IF v_c = 'whatsapp' THEN
      IF v_whatsapp IS NULL THEN
        v_raisons := array_append(v_raisons, 'whatsapp sans numero valide');
      ELSIF v_profil.whatsapp_consent_at IS NULL THEN
        v_raisons := array_append(v_raisons, 'whatsapp sans consentement');
      ELSE
        canal := 'whatsapp'; destination := v_whatsapp;
        motif := NULLIF(array_to_string(v_raisons, ', '), '');
        RETURN NEXT; RETURN;
      END IF;

    ELSIF v_c = 'sms' THEN
      IF v_sms IS NULL THEN
        v_raisons := array_append(v_raisons, 'sms sans numero valide');
      ELSIF v_profil.sms_consent_at IS NULL THEN
        v_raisons := array_append(v_raisons, 'sms sans consentement');
      ELSE
        canal := 'sms'; destination := v_sms;
        motif := NULLIF(array_to_string(v_raisons, ', '), '');
        RETURN NEXT; RETURN;
      END IF;

    ELSIF v_c = 'email' THEN
      IF v_email IS NULL THEN
        v_raisons := array_append(v_raisons, 'aucune adresse');
      ELSE
        -- Le courriel transactionnel ne demande pas de consentement prealable :
        -- il porte le suivi d'une course que la personne a elle-meme engagee.
        canal := 'email'; destination := v_email;
        motif := NULLIF(array_to_string(v_raisons, ', '), '');
        RETURN NEXT; RETURN;
      END IF;

    ELSIF v_c = 'in_app' THEN
      canal := 'in_app'; destination := p_user_id::text;
      motif := NULLIF(array_to_string(v_raisons, ', '), '');
      RETURN NEXT; RETURN;
    END IF;
  END LOOP;
END;
$fn$;

COMMENT ON FUNCTION public.notification_route(uuid) IS
  'Canal et destination retenus pour joindre une personne, avec la raison des replis.';

-- ---------------------------------------------------------------------------
-- 4. Le dépôt applique le routage
--
-- Le canal est fixé au dépôt, pas à l'envoi : si quelqu'un change de numéro
-- entre les deux, le message part vers celui qui valait au moment des faits, et
-- la file reste rejouable sans dépendre de l'état courant du profil.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_enqueue(
  p_user_id   uuid,
  p_errand_id uuid,
  p_event     text,
  p_subject   text,
  p_body      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_route record;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_route FROM public.notification_route(p_user_id);

  INSERT INTO public.notification_outbox
    (user_id, errand_id, event, subject, body, channel, destination, repli_motif)
  VALUES (p_user_id, p_errand_id, p_event, left(p_subject, 200), p_body,
          v_route.canal, v_route.destination, v_route.motif)
  ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  -- Journalisé sans être propagé : la notification est un service rendu en
  -- plus, jamais une condition du service principal.
  RAISE WARNING 'Notification % non deposee : %', p_event, SQLERRM;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. Le portage réclame ce qu'il sait porter
--
-- La fonction rendait l'adresse de courriel du compte, quel que soit le canal.
-- Elle rend maintenant le canal et la destination inscrits au dépôt, et
-- n'écarte plus une notification faute d'adresse : un message WhatsApp n'a pas
-- besoin d'adresse.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.notify_claim_batch(integer);

CREATE OR REPLACE FUNCTION public.notify_claim_batch(p_limit integer DEFAULT 20)
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
      ORDER BY o2.created_at
      LIMIT GREATEST(COALESCE(p_limit, 20), 1)
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.user_id, o.channel, o.destination, o.subject, o.body, o.event
  )
  SELECT p.id,
         COALESCE(p.channel, 'email'),
         -- Une file deposee avant cette migration n'a pas de destination : on
         -- retombe sur l'adresse du compte plutot que de la perdre.
         COALESCE(p.destination, u.email::text),
         u.email::text,
         p.subject, p.body, p.event
  FROM pris p
  LEFT JOIN auth.users u ON u.id = p.user_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notification_route(uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_route(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Chacun règle où il veut être joint
--
-- Le consentement se date au moment où il est donné, et se remet à zéro quand
-- il est retiré. Garder la date d'un consentement retiré laisserait croire
-- qu'il vaut encore.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_preferences_set(
  p_canal_prefere text,
  p_whatsapp      text DEFAULT NULL,
  p_whatsapp_ok   boolean DEFAULT NULL,
  p_sms_ok        boolean DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_profil public.profiles;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Connectez-vous pour regler vos preferences.' USING ERRCODE = '42501';
  END IF;

  IF p_canal_prefere NOT IN ('whatsapp', 'sms', 'email', 'in_app') THEN
    RAISE EXCEPTION 'Canal inconnu : %.', p_canal_prefere USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles SET
    canal_prefere = p_canal_prefere,
    whatsapp = CASE WHEN p_whatsapp IS NULL THEN whatsapp
                    ELSE NULLIF(btrim(p_whatsapp), '') END,
    whatsapp_consent_at = CASE
      WHEN p_whatsapp_ok IS NULL THEN whatsapp_consent_at
      WHEN p_whatsapp_ok THEN COALESCE(whatsapp_consent_at, now())
      ELSE NULL END,
    sms_consent_at = CASE
      WHEN p_sms_ok IS NULL THEN sms_consent_at
      WHEN p_sms_ok THEN COALESCE(sms_consent_at, now())
      ELSE NULL END,
    updated_at = now()
  WHERE id = v_uid
  RETURNING * INTO v_profil;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil introuvable.' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_profil;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notification_preferences_set(text, text, boolean, boolean)
  FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_preferences_set(text, text, boolean, boolean)
  TO authenticated;

-- La vue de sante compte desormais par canal : sans cela, on ne verrait pas
-- qu'un canal entier ne part plus.
DROP VIEW IF EXISTS public.notification_health;
CREATE VIEW public.notification_health AS
  SELECT
    COALESCE(channel, 'non route') AS canal,
    state::text                    AS etat,
    count(*)::integer              AS nombre,
    min(created_at)                AS plus_ancienne,
    max(created_at)                AS plus_recente
  FROM public.notification_outbox
  GROUP BY 1, 2;

GRANT SELECT ON public.notification_health TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Une notification sans fournisseur revient en attente, sans se consumer
--
-- Reclamer un message incremente son compteur de tentatives, et cinq
-- tentatives le condamnent. Un canal qui n'a pas encore de fournisseur n'est
-- pas un echec du message : le laisser bruler ses cinq essais reviendrait a
-- perdre tout ce qui a ete depose avant la signature du contrat.
--
-- La remise en attente rend donc aussi la tentative, sans quoi la file se
-- viderait au rythme des passages de l'ordonnanceur.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_mark(
  p_id    uuid,
  p_state text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_state NOT IN ('sent', 'failed', 'skipped', 'pending') THEN
    RAISE EXCEPTION 'Etat de notification inconnu.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_outbox SET
    state      = p_state::notification_state,
    sent_at    = CASE WHEN p_state = 'sent' THEN now() ELSE sent_at END,
    attempts   = CASE WHEN p_state = 'pending' THEN GREATEST(attempts - 1, 0) ELSE attempts END,
    last_error = left(p_error, 500)
  WHERE id = p_id;
END;
$fn$;
