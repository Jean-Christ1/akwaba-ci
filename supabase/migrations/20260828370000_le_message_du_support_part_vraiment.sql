-- Le message du support part vraiment, et la modération des fiches passe par la
-- matrice.
--
-- Deux défauts trouvés par la recette écrite dans la foulée, pas par relecture.
--
-- Premier défaut, dans le geste écrit une heure plus tôt : message_envoyer
-- récupérait l'identifiant rendu par notify_enqueue, qui ne rend rien du tout.
-- La fonction est déclarée « returns void ». L'affectation d'un vide dans une
-- colonne d'identifiant échouait, et l'envoi remontait « invalid input syntax
-- for type uuid ». Aucun message ne partait.
--
-- Le corriger en ignorant simplement la valeur rendue serait pire : le dépôt
-- ordinaire avale ses erreurs et se contente d'un avertissement, parce qu'une
-- notification de suivi ne doit jamais faire échouer la course qu'elle
-- accompagne. Un message du support n'a pas ce statut. Si rien n'est déposé,
-- l'expéditeur doit l'apprendre tout de suite, sinon il attend une réponse à un
-- message qui n'existe pas. Le dépôt est donc écrit ici, avec sa propre posture
-- devant l'erreur.
--
-- Second défaut, plus ancien : la garde des colonnes privilégiées d'une fiche
-- laissait passer les deux rôles hérités et ignorait « lieux.moderer ». Un
-- responsable de contenu, à qui la console affiche « Modérer les lieux », se
-- faisait refuser la publication.

-- ---------------------------------------------------------------------------
-- Le message du support
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
  v_moi   uuid := auth.uid();
  v_sujet text := btrim(COALESCE(p_sujet, ''));
  v_corps text := btrim(COALESCE(p_corps, ''));
  v_id    uuid;
  v_route record;
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

  -- Le même routage que le suivi de course : il choisit le canal, refuse
  -- WhatsApp et le SMS sans consentement, et finit toujours par un canal qui ne
  -- peut pas échouer.
  SELECT * INTO v_route FROM public.notification_route(p_user_id);

  IF v_route.canal IS NULL THEN
    RAISE EXCEPTION 'Aucun canal ne permet de joindre ce compte.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.notification_outbox
    (user_id, errand_id, event, subject, body, channel, destination, repli_motif)
  VALUES (p_user_id, NULL, 'message_support', left(v_sujet, 200), v_corps,
          v_route.canal, v_route.destination, v_route.motif)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'message_envoyer', 'profile', p_user_id::text,
          jsonb_build_object('sujet', v_sujet, 'canal', v_route.canal, 'avis', v_id));

  RETURN jsonb_build_object('id', v_id, 'canal', v_route.canal, 'repli_motif', v_route.motif);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- La modération des fiches
--
-- Le corps est repris de la définition en base, seule la ligne de contrôle
-- change. La garde pose l'état initial d'une fiche à l'insertion, refuse le
-- changement de propriétaire et le placement payant : la réécrire de mémoire
-- aurait perdu l'un de ces trois gestes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_place_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Le droit de la matrice, et non plus les deux rôles hérités : la console
  -- affiche « Modérer les lieux » au responsable de contenu, il faut que la
  -- porte s'ouvre pour lui.
  IF public.has_permission(auth.uid(), 'lieux.moderer') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Une fiche naît en attente et sans placement payant, quoi qu'en dise
    -- l'appelant. La fonction edge d'inscription, qui utilise la clé de
    -- service, n'est pas concernée par ce déclencheur.
    NEW.status  := 'pending'::place_status;
    NEW.premium := false;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'La publication d''une fiche est décidée par la modération.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.premium IS DISTINCT FROM OLD.premium THEN
    RAISE EXCEPTION 'Le placement premium est attribué par la plateforme.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id THEN
    RAISE EXCEPTION 'Le propriétaire d''une fiche ne peut pas être changé ici.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;
