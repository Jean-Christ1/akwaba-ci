-- Les trois droits morts restants.
--
-- Après les sensibles, il reste au catalogue trois droits courants que rien ne
-- consulte : « lieux.lire », « notifications.envoyer » et
-- « organisations.gerer ». Ils ne sont pas dangereux, mais ils mentent de la
-- même façon : la console les affiche accordés et ils n'ouvrent rien.
--
-- Les trois cas ne se règlent pas pareil, et c'est le point de cette migration.
--
-- Le premier est un simple branchement : la porte existe, elle regardait le
-- rôle hérité.
--
-- Les deux autres décrivent un geste que l'application ne sait pas faire.
-- Personne, dans la console, ne peut écrire à quelqu'un, et personne ne peut
-- aider une organisation dont il n'est pas membre. Un droit qui nomme une
-- fonctionnalité absente doit soit disparaître, soit devenir vrai. Ces deux-là
-- répondent à un besoin réel du support, on écrit donc le geste.

-- ---------------------------------------------------------------------------
-- 1. Les lieux
--
-- Un lieu non publié n'est visible que de son propriétaire et du personnel. La
-- clause qui décrit le personnel citait deux rôles hérités.
--
-- La suppression n'est pas touchée : elle reste au seul rôle administrateur.
-- La faire passer par « lieux.moderer » l'ouvrirait aux modérateurs de contenu,
-- ce qui est un élargissement, pas un branchement, et rien ne le demande.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view published places" ON public.places;
CREATE POLICY "Anyone can view published places" ON public.places
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'::place_status
    OR auth.uid() = owner_id
    OR public.has_permission(auth.uid(), 'lieux.lire')
  );

DROP POLICY IF EXISTS "Owners and admins can update places" ON public.places;
CREATE POLICY "Owners and admins can update places" ON public.places
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR public.has_permission(auth.uid(), 'lieux.moderer'))
  WITH CHECK (auth.uid() = owner_id OR public.has_permission(auth.uid(), 'lieux.moderer'));

-- ---------------------------------------------------------------------------
-- 2. Écrire à quelqu'un
--
-- Le support reçoit un appel, promet de revenir vers la personne, et n'a aucun
-- moyen de le faire depuis la plateforme. Il sort du produit, écrit depuis sa
-- messagerie personnelle, et le message n'existe nulle part le jour où la
-- personne conteste ce qu'on lui a dit.
--
-- Le message part par la voie normale, celle du suivi de course : le routage
-- choisit le canal, refuse WhatsApp et le SMS sans consentement, et retombe sur
-- le courriel. Un message du support n'est pas un message commercial, mais il
-- n'a pas non plus à forcer un canal que la personne n'a pas accepté.
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

  v_id := public.notify_enqueue(p_user_id, NULL, 'message_support', v_sujet, v_corps);

  -- Le dépôt ne lève jamais : il rend NULL quand rien n'a pu être déposé. Le
  -- taire ferait croire à un envoi, l'expéditeur attendrait une réponse qui ne
  -- viendrait pas.
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Le message n''a pas pu être déposé pour ce compte.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_route FROM public.notification_route(p_user_id);

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'message_envoyer', 'profile', p_user_id::text,
          jsonb_build_object('sujet', v_sujet, 'canal', v_route.canal, 'avis', v_id));

  RETURN jsonb_build_object('id', v_id, 'canal', v_route.canal, 'repli_motif', v_route.motif);
END;
$fn$;

REVOKE ALL ON FUNCTION public.message_envoyer(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.message_envoyer(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.message_envoyer(uuid, text, text) IS
  'Message du support à un compte, déposé dans la file d''envoi par le routage habituel. Réservé au droit notifications.envoyer.';

-- ---------------------------------------------------------------------------
-- 3. Aider une organisation
--
-- Une organisation se crée toute seule et se gouverne toute seule, ce qui est
-- bien tant que son responsable est là. Quand il part, l'organisation est
-- bloquée : plus personne ne renouvelle le code d'adhésion, plus personne ne
-- corrige un courriel de contact devenu faux, et le personnel n'y peut rien
-- puisqu'il n'en est pas membre.
--
-- « organisations.gerer » nomme exactement ce cas. Il ouvre le nécessaire, pas
-- davantage : le personnel corrige les coordonnées et renouvelle le code, il ne
-- devient pas membre et ne voit pas ce que les membres échangent.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.organisation_gerer(
  p_org uuid,
  p_nom text DEFAULT NULL,
  p_contact_email text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL
)
RETURNS public.organisations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_moi uuid := auth.uid();
  v_org public.organisations;
BEGIN
  IF NOT public.has_permission(v_moi, 'organisations.gerer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de gérer les organisations.' USING ERRCODE = '42501';
  END IF;

  IF p_nom IS NOT NULL AND char_length(btrim(p_nom)) < 2 THEN
    RAISE EXCEPTION 'Le nom de l''organisation est trop court.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.organisations SET
    -- Un paramètre absent ne touche à rien. Une chaîne vide efface une
    -- coordonnée, ce qui est un geste voulu et non un oubli.
    name = COALESCE(NULLIF(btrim(COALESCE(p_nom, '')), ''), name),
    contact_email = CASE WHEN p_contact_email IS NULL THEN contact_email
                         ELSE NULLIF(btrim(p_contact_email), '') END,
    contact_phone = CASE WHEN p_contact_phone IS NULL THEN contact_phone
                         ELSE NULLIF(btrim(p_contact_phone), '') END,
    updated_at = now()
  WHERE id = p_org
  RETURNING * INTO v_org;

  IF v_org.id IS NULL THEN
    RAISE EXCEPTION 'Organisation introuvable.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'organisation_gerer', 'organisation', p_org::text,
          jsonb_build_object('nom', v_org.name, 'contact_email', v_org.contact_email,
                             'contact_phone', v_org.contact_phone));

  RETURN v_org;
END;
$fn$;

REVOKE ALL ON FUNCTION public.organisation_gerer(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.organisation_gerer(uuid, text, text, text) TO authenticated;

-- Le renouvellement du code passe par la même porte. La fonction est reprise de
-- sa définition en base, seule la ligne de contrôle change : elle portait déjà
-- la correction du rôle inconnu qui rendait la comparaison indéterminée, et la
-- réécrire de mémoire l'aurait perdue.
CREATE OR REPLACE FUNCTION public.organisation_rotate_join_code(p_org uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_moi  public.org_member_role := public.org_role(p_org, auth.uid());
  v_code text;
BEGIN
  -- Un non-membre n'a pas de rôle : la comparaison rend alors l'inconnu, qui
  -- n'est pas vrai, et la garde ne se déclenchait pas. Le cas est nommé.
  --
  -- Le personnel qui gère les organisations passe aussi, sans quoi une
  -- organisation dont le responsable est parti garde à jamais un code que
  -- n'importe quel ancien membre connaît.
  IF NOT public.has_permission(auth.uid(), 'organisations.gerer')
     AND (v_moi IS NULL OR v_moi NOT IN ('owner'::org_member_role, 'manager'::org_member_role)) THEN
    RAISE EXCEPTION 'Seuls les responsables renouvellent le code d''adhésion.' USING ERRCODE = '42501';
  END IF;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  UPDATE public.organisations
  SET join_code = v_code, updated_at = now()
  WHERE id = p_org;

  RETURN v_code;
END;
$function$;
