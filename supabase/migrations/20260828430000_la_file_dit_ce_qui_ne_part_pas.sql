-- La file dit ce qui ne part pas.
--
-- Trouvé en branchant l'envoi d'un message du support : le routage retombe sur
-- le courriel dès que la personne n'a accepté ni WhatsApp ni le SMS, ce qui est
-- le cas de presque tout le monde. Or un seul canal a un porteur.
--
-- `akwaba-portage-whatsapp` réclame la file toutes les deux minutes et remet
-- les messages à Twilio. Rien n'en fait autant pour le courriel ni pour le SMS.
-- La fonction edge `send-notifications` existe et répond « CRON_SECRET non
-- configuré » : elle est déployée, elle n'est appelée par personne.
--
-- Le résultat n'est pas un envoi qui échoue, ce qui se verrait. C'est un
-- message qui reste « en attente » pour toujours, dans une table que personne
-- ne regarde, pendant que la console dit « message déposé » et que
-- l'expéditeur attend une réponse.
--
-- Cette migration ne fait pas partir les messages : poser une clé d'envoi et
-- ouvrir le robinet vers de vraies adresses est une décision qui revient au
-- propriétaire. Elle fait dire au système ce qu'il ne sait pas faire, pour que
-- le silence cesse d'être pris pour un succès.

-- Le verdict est écrit dans une boucle plutôt que dans le SELECT qui le calcule :
-- la phrase que lira un exploitant reste alors lisible dans le code.
CREATE OR REPLACE FUNCTION public.file_sante()
RETURNS TABLE (
  canal text,
  porteur text,
  porteur_actif boolean,
  en_attente integer,
  plus_ancien timestamptz,
  remis integer,
  en_echec integer,
  verdict text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v record;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'exploitation.sante') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter la santé des envois.'
      USING ERRCODE = '42501';
  END IF;

  FOR v IN
    WITH canaux AS (
      SELECT * FROM (VALUES
        ('whatsapp', 'akwaba-portage-whatsapp'),
        ('sms',      NULL),
        ('email',    NULL),
        ('in_app',   'lecture dans l''application')
      ) AS t(canal, porteur)
    )
    SELECT
      c.canal,
      c.porteur,
      CASE
        WHEN c.canal = 'in_app' THEN
          EXISTS (SELECT 1 FROM pg_policy pol
                   WHERE pol.polrelid = 'public.notification_outbox'::regclass
                     AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%in_app%')
        WHEN c.porteur IS NULL THEN false
        ELSE COALESCE((SELECT j.active FROM cron.job j WHERE j.jobname = c.porteur), false)
      END AS actif,
      COALESCE((SELECT count(*)::integer FROM public.notification_outbox o
                 WHERE o.channel = c.canal AND o.state = 'pending'::notification_state), 0) AS attente,
      (SELECT min(o.created_at) FROM public.notification_outbox o
        WHERE o.channel = c.canal AND o.state = 'pending'::notification_state) AS ancien,
      COALESCE((SELECT count(*)::integer FROM public.notification_outbox o
                 WHERE o.channel = c.canal AND o.state = 'sent'::notification_state), 0) AS remis,
      COALESCE((SELECT count(*)::integer FROM public.notification_outbox o
                 WHERE o.channel = c.canal AND o.state = 'failed'::notification_state), 0) AS echoues
    FROM canaux c
    ORDER BY c.canal
  LOOP
    canal := v.canal;
    porteur := v.porteur;
    porteur_actif := v.actif;
    en_attente := v.attente;
    plus_ancien := v.ancien;
    remis := v.remis;
    en_echec := v.echoues;

    verdict := CASE
      WHEN NOT v.actif AND v.attente > 0 THEN
        'Aucun porteur : ' || v.attente || ' message(s) attendent depuis le ' ||
        to_char(v.ancien, 'DD/MM/YYYY HH24:MI') || ' et ne partiront pas.'
      WHEN NOT v.actif THEN
        'Aucun porteur. Un message déposé sur ce canal y resterait.'
      WHEN v.attente > 0 AND v.ancien < now() - interval '1 hour' THEN
        'Le porteur tourne, mais ' || v.attente || ' message(s) attendent depuis plus d''une heure.'
      WHEN v.echoues > 0 THEN
        v.echoues || ' message(s) en échec. Le porteur tourne.'
      ELSE 'Le porteur tourne, rien ne stagne.'
    END;

    RETURN NEXT;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.file_sante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_sante() TO authenticated;

COMMENT ON FUNCTION public.file_sante() IS
  'État de la file d''envoi canal par canal, avec la présence d''un porteur. Un canal sans porteur retient ses messages indéfiniment.';

-- ---------------------------------------------------------------------------
-- L'expéditeur apprend tout de suite ce qui attend son message
--
-- `message_envoyer` répondait « déposé, canal courriel », ce qui se lit comme
-- « parti ». Elle dit désormais si un porteur existe pour le canal retenu, et
-- la console peut le répéter à celui qui écrit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.message_envoyer(
  p_user_id uuid,
  p_sujet text,
  p_corps text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi     uuid := auth.uid();
  v_sujet   text := btrim(COALESCE(p_sujet, ''));
  v_corps   text := btrim(COALESCE(p_corps, ''));
  v_id      uuid;
  v_route   record;
  v_porteur boolean;
BEGIN
  IF NOT public.has_permission(v_moi, 'notifications.envoyer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''envoyer un message.' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_sujet) < 3 THEN
    RAISE EXCEPTION 'Le sujet du message est trop court.' USING ERRCODE = '22023';
  END IF;

  IF char_length(v_corps) < 10 THEN
    RAISE EXCEPTION 'Le message est trop court.' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Compte introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_route FROM public.notification_route(p_user_id);

  IF v_route.canal IS NULL THEN
    RAISE EXCEPTION 'Aucun canal ne permet de joindre ce compte.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notification_outbox
    (user_id, errand_id, event, subject, body, channel, destination, repli_motif)
  VALUES (p_user_id, NULL, 'message_support', left(v_sujet, 200), v_corps,
          v_route.canal, v_route.destination, v_route.motif)
  RETURNING id INTO v_id;

  -- Le canal retenu a-t-il un porteur ? Le taire ferait croire à un envoi.
  --
  -- La question est posée ici plutôt qu'en appelant file_sante(), laquelle
  -- exige « exploitation.sante » : l'expéditeur ne l'a pas forcément, et une
  -- fonction SECURITY DEFINER ne change pas l'identité de son appelant. Le
  -- message aurait alors échoué sur le contrôle d'un autre droit que le sien.
  v_porteur := CASE v_route.canal
    WHEN 'whatsapp' THEN
      COALESCE((SELECT j.active FROM cron.job j WHERE j.jobname = 'akwaba-portage-whatsapp'), false)
    WHEN 'in_app' THEN
      EXISTS (SELECT 1 FROM pg_policy pol
               WHERE pol.polrelid = 'public.notification_outbox'::regclass
                 AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%in_app%')
    ELSE false
  END;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'message_envoyer', 'profile', p_user_id::text,
          jsonb_build_object('sujet', v_sujet, 'canal', v_route.canal, 'avis', v_id,
                             'porteur', COALESCE(v_porteur, false)));

  RETURN jsonb_build_object(
    'id', v_id,
    'canal', v_route.canal,
    'repli_motif', v_route.motif,
    'porteur_actif', COALESCE(v_porteur, false)
  );
END;
$fn$;
