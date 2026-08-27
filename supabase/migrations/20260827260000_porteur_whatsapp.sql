-- Le porteur WhatsApp, dans la base.
--
-- La file de notifications sait router vers WhatsApp depuis le routage
-- multicanal, mais personne ne portait ces messages : le porteur déployé
-- n'envoie que des courriels, et les fonctions serveur ne peuvent pas être
-- redéployées depuis ce poste, le jeton d'administration Supabase répondant
-- 401. Les messages WhatsApp attendaient donc, intacts et immobiles.
--
-- Ils n'ont pas à attendre. La base dispose de tout le nécessaire : pg_net
-- pour l'appel sortant, le coffre chiffré de Supabase pour les identifiants,
-- et l'ordonnanceur qui tourne déjà. Le porteur vit donc ici, et il partira
-- sans qu'aucune fonction serveur soit redéployée.
--
-- Ce que cela ne change pas : les identifiants ne sont jamais écrits dans une
-- migration ni dans une colonne en clair. Ils sont déposés dans le coffre par
-- scripts/twilio-configurer-base.mjs, qui les lit du coffre local et les
-- transmet une seule fois.

-- ---------------------------------------------------------------------------
-- 1. Lire un secret du coffre
--
-- Le coffre de Supabase chiffre au repos et n'expose le clair que par une vue
-- réservée au propriétaire du schéma. On l'encapsule pour que le reste du
-- code n'ait jamais à connaître ce chemin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.secret_lire(p_nom text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $fn$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_nom LIMIT 1;
$fn$;

-- Jamais exposee : seules les fonctions du moteur, qui s'executent avec les
-- droits du proprietaire, la traversent.
REVOKE ALL ON FUNCTION public.secret_lire(text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Envoyer un message WhatsApp par Twilio
--
-- L'API attend un formulaire encodé et une authentification de base. Le
-- message part de façon asynchrone : pg_net rend un identifiant de requête et
-- la réponse arrive plus tard, ce qui convient exactement à une file.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_envoyer(
  p_destination text,
  p_texte       text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $fn$
DECLARE
  v_compte     text := public.secret_lire('twilio_account_sid');
  v_cle        text := public.secret_lire('twilio_api_key_sid');
  v_secret     text := public.secret_lire('twilio_api_key_secret');
  v_expediteur text := public.secret_lire('twilio_whatsapp_from');
  v_numero     text;
  v_requete    bigint;
BEGIN
  IF v_compte IS NULL OR v_cle IS NULL OR v_secret IS NULL OR v_expediteur IS NULL THEN
    RAISE EXCEPTION 'Twilio n''est pas configure dans le coffre.' USING ERRCODE = '22023';
  END IF;

  -- Twilio veut un numero au format international, sans espace ni ponctuation,
  -- prefixe par « whatsapp: ». Un numero ivoirien saisi « +225 07 ... » part
  -- donc en « whatsapp:+22507... ».
  v_numero := regexp_replace(COALESCE(p_destination, ''), '[^0-9+]', '', 'g');
  IF v_numero !~ '^\+?[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Numero WhatsApp inexploitable.' USING ERRCODE = '22023';
  END IF;
  IF left(v_numero, 1) <> '+' THEN
    v_numero := '+' || v_numero;
  END IF;

  -- Les parametres passent par la chaine de requete, pas par le corps.
  --
  -- pg_net n'envoie que du JSON dans un corps, et refuse tout autre type ;
  -- l'API de Twilio, elle, attend un formulaire encode. Elle accepte
  -- heureusement ses parametres en chaine de requete sur un POST, ce qui
  -- reconcilie les deux sans intermediaire.
  SELECT net.http_post(
    url := format('https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json', v_compte),
    params := jsonb_build_object(
      'From', v_expediteur,
      'To', 'whatsapp:' || v_numero,
      'Body', left(COALESCE(p_texte, ''), 1500)
    ),
    headers := jsonb_build_object(
      -- encode(..., 'base64') replie sa sortie tous les soixante-seize
      -- caracteres. Un retour a la ligne dans un en-tete HTTP le rend illegal,
      -- et le serveur repond « Illegal character » sans qu'on devine que le
      -- tort vient de la mise en forme et non du secret.
      'Authorization',
      'Basic ' || replace(encode((v_cle || ':' || v_secret)::bytea, 'base64'), E'
', ''),
      -- pg_net exige ce type des qu'un corps est fourni, et remplacer la table
      -- d'en-tetes efface celui qu'il pose par defaut.
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 8000
  ) INTO v_requete;

  RETURN v_requete;
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_envoyer(text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Le porteur : il prend la file et l'expédie
--
-- Il ne réclame que ce qu'il sait porter, comme le porteur de courriels : la
-- file ne lui remet rien d'autre. Chaque message part une fois, et l'état est
-- inscrit avant tout envoi suivant, de sorte qu'une interruption ne rejoue pas
-- ce qui est déjà parti.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_porter_la_file(p_limite integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_ligne    record;
  v_envoyes  integer := 0;
  v_echoues  integer := 0;
  v_requete  bigint;
BEGIN
  IF public.secret_lire('twilio_api_key_sid') IS NULL THEN
    -- Rien de configure : on ne consomme pas la file. La laisser intacte
    -- permet de tout expedier le jour ou les identifiants arrivent, plutot que
    -- de bruler les tentatives d'ici la.
    RETURN jsonb_build_object('envoyes', 0, 'echoues', 0,
                              'detail', 'Twilio non configure, file conservee');
  END IF;

  FOR v_ligne IN
    SELECT * FROM public.notify_claim_batch(GREATEST(COALESCE(p_limite, 20), 1), ARRAY['whatsapp'])
  LOOP
    BEGIN
      v_requete := public.whatsapp_envoyer(
        v_ligne.destination,
        v_ligne.subject || E'\n\n' || v_ligne.body
      );
      -- « Remis au transporteur », et non « lu » : Twilio repondra plus tard,
      -- et l'identifiant de requete permet de retrouver ce qu'il a dit.
      PERFORM public.notify_mark(v_ligne.id, 'sent', 'pg_net #' || v_requete);
      v_envoyes := v_envoyes + 1;
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.notify_mark(v_ligne.id, 'failed', left(SQLERRM, 300));
      v_echoues := v_echoues + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object('envoyes', v_envoyes, 'echoues', v_echoues);
END;
$fn$;

REVOKE ALL ON FUNCTION public.whatsapp_porter_la_file(integer) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. L'ordonnanceur s'en charge
--
-- taches_planifiees() tourne deja par pg_cron. Le portage WhatsApp s'y range
-- plutot que de creer une seconde horloge : deux ordonnanceurs finissent par
-- diverger, et personne ne sait plus lequel a tourne.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.whatsapp_sante()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT jsonb_build_object(
    'configure', public.secret_lire('twilio_api_key_sid') IS NOT NULL,
    'expediteur', public.secret_lire('twilio_whatsapp_from'),
    'en_attente', (SELECT count(*)::integer FROM public.notification_outbox
                    WHERE channel = 'whatsapp' AND state = 'pending'),
    'envoyes', (SELECT count(*)::integer FROM public.notification_outbox
                 WHERE channel = 'whatsapp' AND state = 'sent'),
    'echoues', (SELECT count(*)::integer FROM public.notification_outbox
                 WHERE channel = 'whatsapp' AND state = 'failed')
  )
  WHERE public.has_permission(auth.uid(), 'exploitation.sante');
$fn$;

GRANT EXECUTE ON FUNCTION public.whatsapp_sante() TO authenticated;
