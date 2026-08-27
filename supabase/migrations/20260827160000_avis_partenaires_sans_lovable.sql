-- Prévenir un établissement d'une demande de réservation, pour de vrai.
--
-- Quand un client cliquait « Demander une réservation », sa demande était bien
-- enregistrée, mais l'avis à l'établissement partait par un appel direct à un
-- connecteur extérieur, en dehors de la file de notifications. Trois
-- conséquences, toutes silencieuses.
--
-- L'appel échouait sans reprise : l'erreur était consignée dans les journaux
-- de la fonction et le client repartait avec un accusé de succès. Un hôtelier
-- pouvait ne jamais savoir qu'on avait voulu réserver chez lui.
--
-- L'expéditeur était un domaine de démonstration, pas celui d'Akwaba.
--
-- Et le canal était le courriel, toujours. Sur les sept établissements
-- publiés, un seul a une adresse renseignée ; quatre ont un numéro WhatsApp.
-- Prévenir par courriel touchait donc un établissement sur sept.
--
-- La file de notifications sait déjà faire tout cela : elle réessaie, elle
-- garde une trace, elle choisit un canal et dit pourquoi elle a replié. Il
-- suffisait de s'en servir.

-- ---------------------------------------------------------------------------
-- 1. Déposer un message pour quelqu'un qui n'a pas de compte
--
-- La file était indexée sur un utilisateur. Un établissement partenaire n'en a
-- pas nécessairement : sur les sept lieux publiés, aucun n'a de compte
-- propriétaire. La colonne était déjà nullable ; il manquait le chemin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_enqueue_direct(
  p_canal       text,
  p_destination text,
  p_event       text,
  p_subject     text,
  p_body        text,
  p_motif       text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_id uuid;
BEGIN
  IF COALESCE(btrim(p_destination), '') = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notification_outbox
    (user_id, errand_id, event, subject, body, channel, destination, repli_motif)
  VALUES (NULL, NULL, p_event, left(p_subject, 200), p_body,
          p_canal, btrim(p_destination), p_motif)
  RETURNING id INTO v_id;

  RETURN v_id;

EXCEPTION WHEN OTHERS THEN
  -- Comme pour le dépôt ordinaire : prévenir est un service rendu en plus,
  -- jamais une condition de l'enregistrement de la demande.
  RAISE WARNING 'Avis % non depose : %', p_event, SQLERRM;
  RETURN NULL;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2. Joindre un établissement
--
-- WhatsApp d'abord, parce que c'est ce que les établissements ont réellement.
-- Le courriel ensuite. Si le lieu a un compte propriétaire, ses préférences
-- l'emportent : quelqu'un qui a dit où le joindre doit être joint là.
--
-- Quand personne n'est joignable, la fonction le dit plutôt que de rendre
-- « envoyé ». Un avis qu'on croit parti est pire qu'un avis qu'on sait bloqué.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.place_notify(
  p_place_id uuid,
  p_event    text,
  p_subject  text,
  p_body     text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lieu     public.places;
  v_route    record;
  v_whatsapp text;
  v_email    text;
  v_id       uuid;
BEGIN
  SELECT * INTO v_lieu FROM public.places WHERE id = p_place_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('depose', false, 'motif', 'lieu introuvable');
  END IF;

  -- Un partenaire qui a un compte a pu dire où le joindre : on ne décide pas
  -- à sa place.
  IF v_lieu.owner_id IS NOT NULL THEN
    SELECT * INTO v_route FROM public.notification_route(v_lieu.owner_id);
    IF v_route.canal IS NOT NULL AND v_route.canal <> 'in_app' THEN
      v_id := public.notify_enqueue_direct(
        v_route.canal, v_route.destination, p_event, p_subject, p_body, v_route.motif);
      IF v_id IS NOT NULL THEN
        RETURN jsonb_build_object('depose', true, 'canal', v_route.canal);
      END IF;
    END IF;
  END IF;

  v_whatsapp := NULLIF(btrim(COALESCE(v_lieu.whatsapp, '')), '');
  IF v_whatsapp IS NOT NULL
     AND length(regexp_replace(v_whatsapp, '\D', '', 'g')) >= 8 THEN
    v_id := public.notify_enqueue_direct('whatsapp', v_whatsapp, p_event, p_subject, p_body);
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('depose', true, 'canal', 'whatsapp');
    END IF;
  END IF;

  v_email := NULLIF(btrim(COALESCE(v_lieu.email, '')), '');
  IF v_email IS NOT NULL AND position('@' IN v_email) > 1 THEN
    v_id := public.notify_enqueue_direct('email', v_email, p_event, p_subject, p_body,
      CASE WHEN v_whatsapp IS NULL THEN 'aucun numero whatsapp' ELSE 'numero whatsapp invalide' END);
    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('depose', true, 'canal', 'email');
    END IF;
  END IF;

  -- Personne n'est joignable. On l'inscrit au journal d'audit : un
  -- etablissement injoignable est un probleme d'exploitation, pas une
  -- fatalite, et quelqu'un doit pouvoir le voir et lui demander un numero.
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (NULL, 'place_injoignable', 'place', p_place_id::text,
          jsonb_build_object('evenement', p_event, 'nom', v_lieu.name));

  RETURN jsonb_build_object('depose', false, 'motif', 'aucun moyen de joindre cet etablissement');
END;
$fn$;

REVOKE ALL ON FUNCTION public.notify_enqueue_direct(text, text, text, text, text, text)
  FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.place_notify(uuid, text, text, text) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. La demande de réservation dépose son avis elle-même
--
-- Le faire ici plutôt que dans la fonction serveur qui reçoit le formulaire
-- garantit que l'avis est déposé dans la même transaction que la demande : ou
-- les deux existent, ou aucun des deux. Un avis perdu parce qu'un appel
-- réseau a échoué après l'enregistrement n'est plus possible.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lead_notify_place()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lieu   text;
  v_sujet  text;
  v_corps  text;
  v_quand  text;
BEGIN
  IF NEW.place_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_lieu FROM public.places WHERE id = NEW.place_id;

  v_quand := CASE
    WHEN NEW.date_from IS NOT NULL AND NEW.date_to IS NOT NULL
      THEN format('du %s au %s', to_char(NEW.date_from, 'DD/MM/YYYY'), to_char(NEW.date_to, 'DD/MM/YYYY'))
    WHEN NEW.date_from IS NOT NULL
      THEN format('le %s', to_char(NEW.date_from, 'DD/MM/YYYY'))
    ELSE 'date non precisee'
  END;

  v_sujet := format('Demande de reservation : %s', COALESCE(v_lieu, 'votre etablissement'));

  -- Le message porte ce qu'il faut pour rappeler la personne sans ouvrir
  -- l'application : un avis qui oblige a se connecter pour savoir qui appeler
  -- ne sert a rien a un hotelier au comptoir.
  v_corps := format(
    'Nouvelle demande recue sur Akwaba.%s' ||
    'Nom : %s%s' ||
    'Telephone : %s%s' ||
    'Personnes : %s%s' ||
    'Sejour : %s%s' ||
    '%s',
    E'\n\n',
    COALESCE(NULLIF(btrim(NEW.full_name), ''), 'non precise'), E'\n',
    COALESCE(NULLIF(btrim(NEW.phone), ''), 'non precise'), E'\n',
    COALESCE(NEW.party_size::text, 'non precise'), E'\n',
    v_quand, E'\n\n',
    COALESCE(NULLIF(btrim(NEW.message), ''), 'Aucun message.')
  );

  PERFORM public.place_notify(NEW.place_id, 'lead_' || NEW.kind, v_sujet, v_corps);

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS lead_notify_place ON public.leads;
CREATE TRIGGER lead_notify_place
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_notify_place();
