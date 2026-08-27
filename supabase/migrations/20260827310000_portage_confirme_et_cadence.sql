-- Le portage WhatsApp disait « envoyé » sans savoir si Twilio avait accepté.
--
-- pg_net est asynchrone : net.http_post rend un identifiant de requête et rend
-- la main aussitôt, avant que Twilio n'ait répondu. Le porteur marquait la
-- ligne « sent » à cet instant. Un message refusé par Twilio, parce que le
-- destinataire n'a pas rejoint le bac à sable ou que le débit est dépassé,
-- était donc compté comme parti. L'exploitation voyait un compteur vert pendant
-- que personne ne recevait rien : la pire des pannes, celle qui se tait.
--
-- La preuve existe pourtant. net._http_response garde la réponse quelques
-- heures, avec son code et le message de Twilio. Une réponse déjà conservée ici
-- porte « code 21604, A 'To' phone number is required » : un refus franc, que
-- le porteur avait pourtant compté comme un envoi.
--
-- Second défaut, de cadence. Le numéro du bac à sable n'accepte qu'un message
-- toutes les trois secondes. Le porteur en remettait trente d'un coup toutes
-- les deux minutes : les premiers passaient, les suivants se faisaient refuser,
-- et tous étaient comptés comme partis.
--
-- Cette migration sépare donc deux choses que le code confondait : remettre au
-- transporteur, et être accepté par lui.

-- ---------------------------------------------------------------------------
-- 1. Ce que la ligne doit retenir de son voyage
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_outbox
  ADD COLUMN IF NOT EXISTS request_id   bigint,
  ADD COLUMN IF NOT EXISTS confirme_le  timestamptz,
  ADD COLUMN IF NOT EXISTS code_reponse integer;

COMMENT ON COLUMN public.notification_outbox.request_id IS
  'Identifiant de la requête pg_net, seul lien vers la réponse du transporteur.';
COMMENT ON COLUMN public.notification_outbox.confirme_le IS
  'Date à laquelle le transporteur a confirmé la prise en charge. NULL = remis, pas encore confirmé.';

CREATE INDEX IF NOT EXISTS notification_outbox_a_confirmer
  ON public.notification_outbox (request_id)
  WHERE request_id IS NOT NULL AND confirme_le IS NULL;

-- ---------------------------------------------------------------------------
-- 2. La cadence, réglable
--
-- Elle ne peut pas être écrite en dur : elle vaut une valeur tant que le compte
-- Twilio est en essai, et une tout autre le jour où il passe en production. Une
-- constante dans le code obligerait à livrer l'application pour changer un
-- chiffre que l'exploitation connaît mieux que le code.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.whatsapp_reglages (
  -- Un seul jeu de réglages, et la contrainte le dit plutôt que de l'espérer.
  unique_ligne          boolean PRIMARY KEY DEFAULT true CHECK (unique_ligne),
  secondes_entre_envois numeric NOT NULL DEFAULT 3 CHECK (secondes_entre_envois BETWEEN 0 AND 60),
  lot_max               integer NOT NULL DEFAULT 20 CHECK (lot_max BETWEEN 1 AND 200),
  -- Au-delà, une remise non confirmée est déclarée invérifiable : pg_net a
  -- purgé la réponse, et personne ne saura jamais ce que Twilio a répondu.
  heures_avant_abandon  integer NOT NULL DEFAULT 6 CHECK (heures_avant_abandon BETWEEN 1 AND 72),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  updated_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.whatsapp_reglages (unique_ligne) VALUES (true)
ON CONFLICT (unique_ligne) DO NOTHING;

ALTER TABLE public.whatsapp_reglages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_reglages FORCE ROW LEVEL SECURITY;

-- Le nom de la politique reste sans accent : un identifiant doit se
-- retrouver a la lettre, ici comme dans les migrations suivantes.
DROP POLICY IF EXISTS "Reglages WhatsApp lisibles par l'exploitation" ON public.whatsapp_reglages;
CREATE POLICY "Reglages WhatsApp lisibles par l'exploitation" ON public.whatsapp_reglages
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'exploitation.sante'));

REVOKE ALL ON public.whatsapp_reglages FROM anon, authenticated;
GRANT SELECT ON public.whatsapp_reglages TO authenticated;

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES ('notifications.parametrer', 'Exploitation', 'Regler les envois',
        'Changer la cadence et la taille des lots d''envoi des notifications.', false, 195)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, position = EXCLUDED.position;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'notifications.parametrer'),
  ('admin_plateforme', 'notifications.parametrer'),
  ('admin_operations', 'notifications.parametrer')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.whatsapp_regler(
  p_secondes_entre_envois numeric DEFAULT NULL,
  p_lot_max               integer DEFAULT NULL,
  p_heures_avant_abandon  integer DEFAULT NULL
)
RETURNS public.whatsapp_reglages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_reglages public.whatsapp_reglages;
BEGIN
  IF NOT public.has_permission(v_uid, 'notifications.parametrer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de regler les envois.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.whatsapp_reglages SET
    secondes_entre_envois = COALESCE(p_secondes_entre_envois, secondes_entre_envois),
    lot_max               = COALESCE(p_lot_max, lot_max),
    heures_avant_abandon  = COALESCE(p_heures_avant_abandon, heures_avant_abandon),
    updated_at = now(),
    updated_by = v_uid
  WHERE unique_ligne
  RETURNING * INTO v_reglages;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'whatsapp_regler', 'whatsapp_reglages', 'unique',
          jsonb_build_object('secondes', v_reglages.secondes_entre_envois,
                             'lot_max', v_reglages.lot_max));

  RETURN v_reglages;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_regler(numeric, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.whatsapp_regler(numeric, integer, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Remettre au transporteur, en respectant sa cadence
--
-- « sent » ne veut plus dire « reçu » mais « remis ». La confirmation vient
-- ensuite, et c'est confirme_le qui la porte.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_porter_la_file(p_limite integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ligne     record;
  v_reglages  public.whatsapp_reglages;
  v_envoyes   integer := 0;
  v_echoues   integer := 0;
  v_requete   bigint;
  v_premier   boolean := true;
BEGIN
  IF public.secret_lire('twilio_api_key_sid') IS NULL THEN
    -- Rien de configuré : on ne consomme pas la file. La laisser intacte permet
    -- de tout expédier le jour où les identifiants arrivent, plutôt que de
    -- brûler les tentatives d'ici là.
    RETURN jsonb_build_object('envoyes', 0, 'echoues', 0,
                              'detail', 'Twilio non configure, file conservee');
  END IF;

  SELECT * INTO v_reglages FROM public.whatsapp_reglages WHERE unique_ligne;

  FOR v_ligne IN
    SELECT * FROM public.notify_claim_batch(
      LEAST(GREATEST(COALESCE(p_limite, 20), 1), v_reglages.lot_max),
      ARRAY['whatsapp']
    )
  LOOP
    -- L'attente sépare deux remises, jamais avant la première : le bac à sable
    -- n'accepte qu'un message toutes les trois secondes, et remettre le lot
    -- entier d'un coup faisait refuser tout ce qui suivait le premier.
    IF NOT v_premier AND v_reglages.secondes_entre_envois > 0 THEN
      PERFORM pg_sleep(v_reglages.secondes_entre_envois);
    END IF;
    v_premier := false;

    BEGIN
      v_requete := public.whatsapp_envoyer(
        v_ligne.destination,
        v_ligne.subject || E'\n\n' || v_ligne.body
      );
      PERFORM public.notify_mark(v_ligne.id, 'sent', NULL);
      UPDATE public.notification_outbox
         SET request_id = v_requete, confirme_le = NULL, code_reponse = NULL
       WHERE id = v_ligne.id;
      v_envoyes := v_envoyes + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.notify_mark(v_ligne.id, 'failed', left(SQLERRM, 300));
      v_echoues := v_echoues + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('remis', v_envoyes, 'echoues', v_echoues,
                            'envoyes', v_envoyes);
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_porter_la_file(integer) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 4. Lire ce que le transporteur a répondu
--
-- Sans cette passe, un refus de Twilio reste invisible : il ne remonte nulle
-- part, et la ligne garde son « remis » pour toujours.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_reconcilier(p_limite integer DEFAULT 200)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ligne      record;
  v_reglages   public.whatsapp_reglages;
  v_confirmes  integer := 0;
  v_refuses    integer := 0;
  v_a_refaire  integer := 0;
  v_perdus     integer := 0;
  v_motif      text;
BEGIN
  SELECT * INTO v_reglages FROM public.whatsapp_reglages WHERE unique_ligne;

  FOR v_ligne IN
    SELECT o.id, o.request_id, o.sent_at, o.attempts,
           r.status_code, r.error_msg, r.content
      FROM public.notification_outbox o
      LEFT JOIN net._http_response r ON r.id = o.request_id
     WHERE o.request_id IS NOT NULL
       AND o.confirme_le IS NULL
     ORDER BY o.sent_at
     LIMIT GREATEST(COALESCE(p_limite, 200), 1)
  LOOP
    IF v_ligne.status_code IS NULL AND v_ligne.error_msg IS NULL THEN
      -- Pas encore de réponse. Au-delà du délai de conservation de pg_net, il
      -- n'y en aura jamais : on le dit plutôt que de laisser la ligne en
      -- suspens indéfiniment, où elle passerait pour un envoi réussi.
      IF v_ligne.sent_at < now() - make_interval(hours => v_reglages.heures_avant_abandon) THEN
        UPDATE public.notification_outbox
           SET confirme_le = now(),
               last_error = 'Reponse du transporteur expiree : remise non confirmee.'
         WHERE id = v_ligne.id;
        v_perdus := v_perdus + 1;
      END IF;
      CONTINUE;
    END IF;

    IF v_ligne.status_code BETWEEN 200 AND 299 THEN
      UPDATE public.notification_outbox
         SET confirme_le = now(), code_reponse = v_ligne.status_code, last_error = NULL
       WHERE id = v_ligne.id;
      v_confirmes := v_confirmes + 1;
      CONTINUE;
    END IF;

    -- Twilio répond en JSON et nomme la cause. La garder telle quelle vaut
    -- mieux qu'un « échec » qui n'apprend rien à celui qui cherche.
    --
    -- La conversion doit être protégée : tout ce qui revient n'est pas du JSON.
    -- Une passerelle en amont a déjà répondu « Bad Message 400 » en HTML, et un
    -- transporteur indisponible répond « Service Unavailable » en texte brut.
    -- Sans cette protection, une seule réponse de ce genre faisait échouer la
    -- réconciliation entière, et toute la file restait bloquée derrière elle.
    v_motif := NULLIF(v_ligne.error_msg, '');
    IF v_motif IS NULL AND v_ligne.content IS NOT NULL THEN
      BEGIN
        v_motif := (v_ligne.content::jsonb ->> 'message');
      EXCEPTION WHEN OTHERS THEN
        v_motif := NULL;
      END;
    END IF;
    v_motif := COALESCE(v_motif, left(COALESCE(v_ligne.content, 'sans détail'), 300));

    IF v_ligne.status_code = 429 OR v_ligne.status_code BETWEEN 500 AND 599 THEN
      -- Débit dépassé, ou panne passagère chez le transporteur : ce message
      -- mérite une nouvelle chance, pas un abandon.
      UPDATE public.notification_outbox
         SET state = 'pending'::notification_state,
             request_id = NULL, confirme_le = NULL, code_reponse = v_ligne.status_code,
             sent_at = NULL,
             last_error = left('A refaire (' || v_ligne.status_code || ') : ' || v_motif, 500)
       WHERE id = v_ligne.id;
      v_a_refaire := v_a_refaire + 1;
    ELSE
      UPDATE public.notification_outbox
         SET state = 'failed'::notification_state,
             confirme_le = now(), code_reponse = v_ligne.status_code,
             last_error = left(v_motif, 500)
       WHERE id = v_ligne.id;
      v_refuses := v_refuses + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('confirmes', v_confirmes, 'refuses', v_refuses,
                            'a_refaire', v_a_refaire, 'invérifiables', v_perdus);
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_reconcilier(integer) FROM PUBLIC;

COMMENT ON FUNCTION public.whatsapp_reconcilier(integer) IS
  'Lit les réponses de Twilio conservées par pg_net et corrige la file. Appelée par pg_cron.';

-- ---------------------------------------------------------------------------
-- 5. La réconciliation entre dans l'ordonnanceur
-- ---------------------------------------------------------------------------

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'akwaba-reconcilier-whatsapp';

SELECT cron.schedule(
  'akwaba-reconcilier-whatsapp',
  '*/2 * * * *',
  $$SELECT public.whatsapp_reconcilier(200)$$
);

-- ---------------------------------------------------------------------------
-- 6. Ce que l'exploitation lit
--
-- « Remis » et « confirmé » ne sont plus le même chiffre. L'écart entre les
-- deux est précisément ce qu'il fallait voir.
-- ---------------------------------------------------------------------------

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
  v_reglages public.whatsapp_reglages;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'exploitation.sante') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter la santé des envois.'
      USING ERRCODE = '42501';
  END IF;

  v_expediteur := public.secret_lire('twilio_whatsapp_from');
  SELECT * INTO v_reglages FROM public.whatsapp_reglages WHERE unique_ligne;

  SELECT * INTO v_dernier_echec
    FROM public.notification_outbox
   WHERE channel = 'whatsapp' AND state = 'failed'
   ORDER BY created_at DESC
   LIMIT 1;

  RETURN jsonb_build_object(
    'configure', public.secret_lire('twilio_api_key_sid') IS NOT NULL,
    'expediteur', v_expediteur,
    -- Le +14155238886 est le numéro du bac à sable, partagé par tous les
    -- comptes d'essai. Il n'écrit qu'aux personnes qui l'ont rejoint, cesse de
    -- le faire trois jours plus tard, et n'accepte qu'un message toutes les
    -- trois secondes. C'est la première cause de message non reçu.
    'bac_a_sable', v_expediteur = 'whatsapp:+14155238886',
    'en_attente', (SELECT count(*)::integer FROM public.notification_outbox
                    WHERE channel = 'whatsapp' AND state = 'pending'),
    'remis', (SELECT count(*)::integer FROM public.notification_outbox
               WHERE channel = 'whatsapp' AND state = 'sent'),
    'confirmes', (SELECT count(*)::integer FROM public.notification_outbox
                   WHERE channel = 'whatsapp' AND state = 'sent' AND confirme_le IS NOT NULL
                     AND code_reponse BETWEEN 200 AND 299),
    'sans_confirmation', (SELECT count(*)::integer FROM public.notification_outbox
                           WHERE channel = 'whatsapp' AND state = 'sent' AND confirme_le IS NULL),
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
    'cadence_secondes', v_reglages.secondes_entre_envois,
    'lot_max', v_reglages.lot_max,
    'porteur_actif', EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'akwaba-portage-whatsapp' AND active
    ),
    'reconciliation_active', EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'akwaba-reconcilier-whatsapp' AND active
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
