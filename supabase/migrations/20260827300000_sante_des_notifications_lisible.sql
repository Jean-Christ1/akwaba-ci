-- La santé des notifications doit être lisible, et se refuser franchement.
--
-- whatsapp_sante() portait sa vérification de droit dans un WHERE. Un appelant
-- sans le droit ne recevait pas un refus : il recevait NULL, exactement comme
-- si rien n'était configuré. L'écran aurait affiché « non configuré » à un
-- exploitant à qui il manquait seulement une habilitation, et la vraie cause
-- serait restée introuvable.
--
-- Elle rend aussi trop peu. Savoir qu'il reste douze messages en attente ne dit
-- pas s'ils partent : une file qui n'avance pas et une file vide se ressemblent
-- de loin. On ajoute donc la date du dernier envoi, le dernier échec avec son
-- motif, et le fait de passer ou non par le bac à sable, dont les règles
-- expliquent la plupart des non-réceptions.

CREATE OR REPLACE FUNCTION public.whatsapp_sante()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_expediteur text;
  v_dernier_echec public.notification_outbox;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'exploitation.sante') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter la santé des envois.'
      USING ERRCODE = '42501';
  END IF;

  v_expediteur := public.secret_lire('twilio_whatsapp_from');

  SELECT * INTO v_dernier_echec
    FROM public.notification_outbox
   WHERE channel = 'whatsapp' AND state = 'failed'
   ORDER BY created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'configure', public.secret_lire('twilio_api_key_sid') IS NOT NULL,
    'expediteur', v_expediteur,
    -- Le numéro +14155238886 est celui du bac à sable, partagé par tous les
    -- comptes d'essai de Twilio. Il n'accepte d'écrire qu'aux personnes qui
    -- l'ont rejoint, et cesse de le faire au bout de trois jours sans échange.
    -- C'est la première cause de message non reçu, et l'écran doit le dire.
    'bac_a_sable', v_expediteur = 'whatsapp:+14155238886',
    'en_attente', (SELECT count(*)::integer FROM public.notification_outbox
                    WHERE channel = 'whatsapp' AND state = 'pending'),
    'envoyes', (SELECT count(*)::integer FROM public.notification_outbox
                 WHERE channel = 'whatsapp' AND state = 'sent'),
    'echoues', (SELECT count(*)::integer FROM public.notification_outbox
                 WHERE channel = 'whatsapp' AND state = 'failed'),
    'dernier_envoi', (SELECT max(sent_at) FROM public.notification_outbox
                       WHERE channel = 'whatsapp' AND state = 'sent'),
    'dernier_echec', CASE WHEN v_dernier_echec.id IS NULL THEN NULL ELSE
      jsonb_build_object(
        'quand', v_dernier_echec.created_at,
        'motif', left(COALESCE(v_dernier_echec.last_error, 'motif non enregistré'), 300),
        'tentatives', v_dernier_echec.attempts
      ) END,
    -- Le porteur est un travail planifié. S'il ne tourne plus, la file grossit
    -- sans que rien n'échoue : c'est l'exact contraire d'une panne visible.
    'porteur_actif', EXISTS (
      SELECT 1 FROM cron.job
       WHERE jobname = 'akwaba-portage-whatsapp' AND active
    ),
    'porteur_dernier_passage', (
      SELECT max(d.start_time) FROM cron.job_run_details d
        JOIN cron.job j ON j.jobid = d.jobid
       WHERE j.jobname = 'akwaba-portage-whatsapp' AND d.status = 'succeeded'
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_sante() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_sante() TO authenticated;

COMMENT ON FUNCTION public.whatsapp_sante() IS
  'État du portage WhatsApp pour l''exploitation. Refuse franchement sans le droit nomme exploitation point sante.';
