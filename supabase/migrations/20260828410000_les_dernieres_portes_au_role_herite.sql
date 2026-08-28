-- Les dernieres portes qui regardaient le role herite.
--
-- La mesure, refaite apres avoir branche la matrice et sa portee : quinze
-- politiques et treize fonctions decidaient encore d'un acces en lisant
-- `user_roles`. Ni `droits_jamais_consultes()` ni
-- `portees_qui_ne_restreignent_pas()` ne les voyaient, pour une raison simple :
-- ces deux mesures cherchent des droits mal branches, pas des portes qui
-- ignorent la matrice.
--
-- L'effet est le meme des deux cotes. Un responsable financier, a qui la
-- console affiche « Consulter les paiements », ne voyait pas un portefeuille de
-- shopper. Un ancien moderateur, sans aucun role dans la matrice, lisait encore
-- les messages de toutes les courses du pays.
--
-- Chaque porte recoit le droit qui la decrit deja au catalogue, et sa ville
-- quand le droit est declare restreignable. Les roles herites continuent
-- d'ouvrir par le chemin normal, `has_permission` portant l'acces de secours.
--
-- Une consequence a nommer, parce qu'elle restreint : le contournement de
-- l'immuabilite d'un compte de versement passe de « administrateur ou
-- moderateur » a « qui approuve les retraits ». C'est un pouvoir sur l'argent,
-- et il revient au metier qui le porte. Aucun ecran ne le perd : la console des
-- retraits est tenue par le responsable financier.

-- ---------------------------------------------------------------------------
-- Les politiques
-- ---------------------------------------------------------------------------

-- Ce qui gravite autour d'une course se lit avec le droit de suivre les
-- courses, dans la ville de la course.
DROP POLICY IF EXISTS "Participants read events" ON public.errand_events;
CREATE POLICY "Participants read events" ON public.errand_events
  FOR SELECT TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_scoped_permission(auth.uid(), 'courses.lire',
         (SELECT e.city FROM public.errands e WHERE e.id = errand_events.errand_id))
  );

DROP POLICY IF EXISTS "Participants read items" ON public.errand_items;
CREATE POLICY "Participants read items" ON public.errand_items
  FOR SELECT TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_scoped_permission(auth.uid(), 'courses.lire',
         (SELECT e.city FROM public.errands e WHERE e.id = errand_items.errand_id))
  );

DROP POLICY IF EXISTS "Participants read messages" ON public.errand_messages;
CREATE POLICY "Participants read messages" ON public.errand_messages
  FOR SELECT TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_scoped_permission(auth.uid(), 'courses.lire',
         (SELECT e.city FROM public.errands e WHERE e.id = errand_messages.errand_id))
  );

DROP POLICY IF EXISTS "Participants read tracking" ON public.errand_tracking;
CREATE POLICY "Participants read tracking" ON public.errand_tracking
  FOR SELECT TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_scoped_permission(auth.uid(), 'courses.lire',
         (SELECT e.city FROM public.errands e WHERE e.id = errand_tracking.errand_id))
  );

-- Une course programmee est un modele, pas une course : elle ne porte pas de
-- ville, et le droit s'applique donc sans perimetre.
DROP POLICY IF EXISTS "Own schedules" ON public.errand_schedules;
CREATE POLICY "Own schedules" ON public.errand_schedules
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.has_permission(auth.uid(), 'courses.lire'));

-- La file d'envoi est un organe d'exploitation : on la lit pour savoir si les
-- messages partent.
DROP POLICY IF EXISTS "Staff read outbox" ON public.notification_outbox;
CREATE POLICY "Staff read outbox" ON public.notification_outbox
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'exploitation.sante'));

DROP POLICY IF EXISTS "Errand proofs read participant" ON storage.objects;
CREATE POLICY "Errand proofs read participant" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'errand-proofs'
    AND (
      public.is_errand_participant(((storage.foldername(name))[1])::uuid, auth.uid())
      OR public.has_scoped_permission(auth.uid(), 'courses.lire',
           (SELECT e.city FROM public.errands e WHERE e.id = ((storage.foldername(name))[1])::uuid))
    )
  );

DROP POLICY IF EXISTS "Membres visibles entre eux" ON public.organisation_members;
CREATE POLICY "Membres visibles entre eux" ON public.organisation_members
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organisation_id, auth.uid())
    OR public.has_permission(auth.uid(), 'organisations.lire')
  );

-- L'acces de secours passait deja par has_permission : la mention explicite du
-- role herite ne servait qu'a le repeter.
DROP POLICY IF EXISTS "Admins update payouts" ON public.payout_requests;
CREATE POLICY "Admins update payouts" ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (public.has_permission(auth.uid(), 'retraits.approuver'))
  WITH CHECK (public.has_permission(auth.uid(), 'retraits.approuver'));

DROP POLICY IF EXISTS "Moderators and admins insert events" ON public.place_moderation_events;
CREATE POLICY "Moderators and admins insert events" ON public.place_moderation_events
  FOR INSERT TO authenticated
  WITH CHECK (
    moderator_id = auth.uid()
    AND public.has_scoped_permission(auth.uid(), 'lieux.moderer',
          (SELECT p.city FROM public.places p WHERE p.id = place_moderation_events.place_id))
  );

DROP POLICY IF EXISTS "Owner, moderators and admins read events" ON public.place_moderation_events;
CREATE POLICY "Owner, moderators and admins read events" ON public.place_moderation_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.places p
             WHERE p.id = place_moderation_events.place_id AND p.owner_id = auth.uid())
    OR public.has_scoped_permission(auth.uid(), 'lieux.moderer',
         (SELECT p.city FROM public.places p WHERE p.id = place_moderation_events.place_id))
  );

DROP POLICY IF EXISTS "Staff read profiles" ON public.profiles;
CREATE POLICY "Staff read profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'utilisateurs.lire'));

DROP POLICY IF EXISTS "Own referral read" ON public.referrals;
CREATE POLICY "Own referral read" ON public.referrals
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'paiements.lire'));

DROP POLICY IF EXISTS "Own wallet read" ON public.runner_wallets;
CREATE POLICY "Own wallet read" ON public.runner_wallets
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'paiements.lire'));

-- Deux politiques disaient la meme chose sur la meme table. Celle qui reste
-- couvre les deux cas ; en garder une seconde, identique a une disjonction
-- pres, faisait croire a une regle supplementaire.
DROP POLICY IF EXISTS "Staff read wallets" ON public.runner_wallets;

DROP POLICY IF EXISTS "Own wallet entries" ON public.wallet_entries;
CREATE POLICY "Own wallet entries" ON public.wallet_entries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission(auth.uid(), 'paiements.lire'));

-- Un quartier est une subdivision de ville : c'est exactement ce que le droit
-- « Gerer villes et quartiers » recouvre.
DROP POLICY IF EXISTS "Admins manage zones" ON public.service_zones;
CREATE POLICY "Admins manage zones" ON public.service_zones
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'villes.gerer'))
  WITH CHECK (public.has_permission(auth.uid(), 'villes.gerer'));

DROP POLICY IF EXISTS "Offer update by parties" ON public.errand_offers;
CREATE POLICY "Offer update by parties" ON public.errand_offers
  FOR UPDATE TO authenticated
  USING (
    runner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.errands e
                WHERE e.id = errand_offers.errand_id AND e.customer_id = auth.uid())
    OR public.has_scoped_permission(auth.uid(), 'courses.corriger',
         (SELECT e.city FROM public.errands e WHERE e.id = errand_offers.errand_id))
  );


-- ---------------------------------------------------------------------------
-- Les fonctions
--
-- Reprises de leur definition en base, seule la ligne de controle change.
-- ---------------------------------------------------------------------------


CREATE OR REPLACE FUNCTION public.admin_dashboard(p_days integer DEFAULT 30)
 RETURNS TABLE(courses_total bigint, courses_completed bigint, courses_cancelled bigint, courses_disputed bigint, courses_open bigint, volume_achats numeric, volume_service numeric, commission_encaissee numeric, supplements numeric, duree_moyenne_min numeric, ecart_temps_moyen numeric, ecart_distance_moyen numeric, shoppers_actifs bigint, shoppers_en_attente bigint, retraits_en_attente bigint, montant_a_verser numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_depuis timestamptz := now() - make_interval(days => GREATEST(p_days, 1));
BEGIN
  -- Le tableau de bord est un organe d'exploitation : le droit qui le
  -- decrit deja au catalogue est « Voir la sante de l'exploitation ».
  IF NOT public.has_permission(auth.uid(), 'exploitation.sante') THEN
    RAISE EXCEPTION 'Accès réservé à l''équipe.' USING ERRCODE = '42501';
  END IF;

  SELECT
    count(*),
    count(*) FILTER (WHERE status = 'completed'::errand_status),
    count(*) FILTER (WHERE status = 'cancelled'::errand_status),
    count(*) FILTER (WHERE status = 'disputed'::errand_status),
    count(*) FILTER (WHERE status = 'open'::errand_status),
    COALESCE(sum(items_total) FILTER (WHERE status = 'completed'::errand_status), 0),
    COALESCE(sum(service_fee) FILTER (WHERE status = 'completed'::errand_status), 0),
    COALESCE(sum(commission_amount) FILTER (WHERE status = 'completed'::errand_status), 0),
    COALESCE(sum(overrun_fee) FILTER (WHERE status = 'completed'::errand_status), 0),
    ROUND(AVG(actual_minutes) FILTER (WHERE status = 'completed'::errand_status), 1),
    ROUND(AVG(
      CASE WHEN COALESCE(estimated_minutes, 0) > 0 AND actual_minutes IS NOT NULL
           THEN (actual_minutes::numeric / estimated_minutes - 1) * 100 END
    ), 1),
    ROUND(AVG(
      CASE WHEN COALESCE(distance_km, 0) > 0 AND actual_distance_km IS NOT NULL
           THEN (actual_distance_km / distance_km - 1) * 100 END
    ), 1)
  INTO
    courses_total, courses_completed, courses_cancelled, courses_disputed, courses_open,
    volume_achats, volume_service, commission_encaissee, supplements,
    duree_moyenne_min, ecart_temps_moyen, ecart_distance_moyen
  FROM public.errands
  WHERE created_at >= v_depuis;

  SELECT
    count(*) FILTER (WHERE status = 'approved'::runner_status),
    count(*) FILTER (WHERE status = 'pending'::runner_status)
  INTO shoppers_actifs, shoppers_en_attente
  FROM public.runner_profiles;

  SELECT
    count(*) FILTER (WHERE status IN ('requested'::payout_status, 'processing'::payout_status)),
    COALESCE(sum(amount) FILTER (WHERE status IN ('requested'::payout_status, 'processing'::payout_status)), 0)
  INTO retraits_en_attente, montant_a_verser
  FROM public.payout_requests;

  RETURN NEXT;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.catalogue_des_droits()
 RETURNS TABLE(code text, categorie text, libelle text, description text, ne_permet_pas text, sensible boolean, portee text, rang integer, roles text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- La question posee est « du personnel ? », et elle a desormais une
  -- reponse ailleurs que dans le role herite. Une exception nominative
  -- suffit : quelqu'un a qui l'on a confie un droit precis, sans role,
  -- fait partie du personnel et doit pouvoir lire le catalogue.
  IF NOT public.est_du_personnel(auth.uid()) THEN
    RAISE EXCEPTION 'Le catalogue des droits est réservé au personnel.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.code, p.categorie, p.libelle, p.description, p.ne_permet_pas,
         p.sensible, p.portee, p.position,
         COALESCE(
           (SELECT array_agg(rp.role_code ORDER BY sr.niveau)
              FROM public.role_permissions rp
              JOIN public.staff_roles sr ON sr.code = rp.role_code
             WHERE rp.permission_code = p.code),
           ARRAY[]::text[]
         )
    FROM public.permissions p
   ORDER BY p.position, p.code;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.catalogue_des_roles()
 RETURNS TABLE(code text, libelle text, description text, niveau smallint, systeme boolean, droits integer, membres integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.est_du_personnel(auth.uid()) THEN
    RAISE EXCEPTION 'Le catalogue des rôles est réservé au personnel.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.code, r.libelle, r.description, r.niveau, r.systeme,
         (SELECT count(*)::integer FROM public.role_permissions rp WHERE rp.role_code = r.code),
         (SELECT count(DISTINCT a.user_id)::integer FROM public.staff_assignments a
           WHERE a.role_code = r.code AND (a.expire_le IS NULL OR a.expire_le > now()))
    FROM public.staff_roles r
   ORDER BY r.niveau, r.code;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.dispute_frozen_amounts()
 RETURNS TABLE(errand_id uuid, gele numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id,
         GREATEST(COALESCE(-sum(w.amount), 0), 0)::numeric
  FROM public.errands e
  LEFT JOIN public.wallet_entries w
    ON w.errand_id = e.id
   AND w.kind = 'adjustment'::wallet_entry_kind
  WHERE e.status = 'disputed'::errand_status
    AND public.has_scoped_permission(auth.uid(), 'litiges.lire', e.city)
  GROUP BY e.id;
$function$
;


CREATE OR REPLACE FUNCTION public.errand_alert_counts()
 RETURNS TABLE(alerte text, nombre integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.alerte, count(*)::int
  FROM public.errand_operations o
  WHERE o.alerte IS NOT NULL
    AND public.has_scoped_permission(auth.uid(), 'courses.lire', o.city)
  GROUP BY o.alerte
  ORDER BY count(*) DESC;
$function$
;


CREATE OR REPLACE FUNCTION public.errand_cancel(p_errand_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errand      public.errands;
  v_is_customer boolean;
  v_is_runner   boolean;
  v_personnel   boolean;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- COALESCE : une comparaison avec un identifiant nul ne doit jamais valoir
  -- autre chose que faux.
  v_is_customer := COALESCE(v_errand.customer_id = auth.uid(), false);
  v_is_runner   := COALESCE(v_errand.runner_id = auth.uid(), false);
  -- Annuler la course d'un autre est une correction, et elle ne vaut que
  -- dans la ville confiee.
  v_personnel   := public.has_scoped_permission(auth.uid(), 'courses.corriger',
                     v_errand.city);

  IF NOT (v_is_customer OR v_is_runner OR v_personnel) THEN
    RAISE EXCEPTION 'Vous ne participez pas à cette course.' USING ERRCODE = '42501';
  END IF;

  IF v_errand.status IN ('completed'::errand_status, 'cancelled'::errand_status) THEN
    RAISE EXCEPTION 'Cette course ne peut plus être annulée.' USING ERRCODE = '22023';
  END IF;

  IF v_errand.status = 'delivered'::errand_status THEN
    RAISE EXCEPTION 'La course a été livrée : ouvrez un litige plutôt qu''une annulation.'
      USING ERRCODE = '22023';
  END IF;

  IF v_errand.payment_status = 'paid'::pay_status THEN
    RAISE EXCEPTION 'Une course déjà réglée ne peut pas être annulée, ouvrez un litige.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  -- Le désistement du shopper : la course retourne au marché, personne ne perd
  -- d'argent. Ce chemin passe avant la garde qui suit, qui ne vise que le
  -- client.
  IF v_is_runner AND NOT v_is_customer
     AND v_errand.status IN ('assigned'::errand_status, 'shopping'::errand_status) THEN
    UPDATE public.errands SET
      runner_id = NULL,
      status    = 'open'::errand_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

    PERFORM public.log_errand_event(p_errand_id, 'open'::errand_status,
      COALESCE(NULLIF(p_reason, ''), 'Le shopper s''est désisté, la course est de nouveau ouverte'));
    RETURN v_errand;
  END IF;

  -- Le point ajouté : de l'argent a été engagé par le shopper. Annuler d'un clic
  -- le laisserait débiteur et sans recours, puisque le litige est refusé sur une
  -- course annulée.
  IF NOT v_personnel
     AND (COALESCE(v_errand.items_total, 0) > 0 OR v_errand.receipt_url IS NOT NULL) THEN
    RAISE EXCEPTION 'Le shopper a déjà engagé les achats : ouvrez un litige plutôt qu''une annulation.'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.errands SET status = 'cancelled'::errand_status
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  PERFORM public.log_errand_event(p_errand_id, 'cancelled'::errand_status,
    COALESCE(NULLIF(p_reason, ''), 'Course annulée'));

  RETURN v_errand;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.guard_errand_city_open()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ouverte boolean;
BEGIN
  -- Poser une course dans une ville fermee est un geste de correction,
  -- et il ne vaut que dans la ville confiee.
  IF public.has_scoped_permission(auth.uid(), 'courses.corriger', NEW.city) THEN
    RETURN NEW;
  END IF;

  -- La ville est reconnue par son nom ou par son identifiant court : le
  -- formulaire envoie le nom, d'autres chemins pourraient envoyer le second.
  SELECT errands_enabled
  INTO v_ouverte
  FROM public.service_cities
  WHERE name = NEW.city OR slug = NEW.city
  LIMIT 1;

  IF v_ouverte IS NULL THEN
    RAISE EXCEPTION 'La ville « % » ne fait pas partie des villes desservies.', NEW.city
      USING ERRCODE = '22023';
  END IF;

  IF NOT v_ouverte THEN
    RAISE EXCEPTION 'Le service de courses n''est pas encore ouvert à %. Choisissez une ville desservie.', NEW.city
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.guard_errand_items()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sans identité applicative, l'appel vient de la base elle-même : migration,
  -- tâche planifiée, ou cascade. Le navigateur, lui, a toujours une identité.
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- La ville vient de la course, l'article n'en portant pas.
  IF public.has_scoped_permission(auth.uid(), 'courses.corriger',
       (SELECT e.city FROM public.errands e
         WHERE e.id = COALESCE(NEW.errand_id, OLD.errand_id))) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  RAISE EXCEPTION 'L''état d''un article est géré par la plateforme.' USING ERRCODE = '42501';
END;
$function$
;


CREATE OR REPLACE FUNCTION public.guard_errand_offer_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR current_setting('app.errand_engine', true) = 'on'
     OR public.has_scoped_permission(auth.uid(), 'courses.corriger',
          (SELECT e.city FROM public.errands e WHERE e.id = NEW.errand_id)) THEN
    RETURN NEW;
  END IF;

  -- Seul le shopper qui a émis l'offre peut en changer les termes, et seulement
  -- tant qu'elle est en attente.
  IF (NEW.price IS DISTINCT FROM OLD.price
      OR NEW.eta_minutes IS DISTINCT FROM OLD.eta_minutes)
     AND (OLD.runner_id <> auth.uid() OR OLD.status <> 'pending'::offer_status) THEN
    RAISE EXCEPTION 'Le prix d''une offre ne peut être modifié que par le shopper qui l''a proposée.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.runner_id IS DISTINCT FROM OLD.runner_id
     OR NEW.errand_id IS DISTINCT FROM OLD.errand_id THEN
    RAISE EXCEPTION 'Une offre ne peut pas changer d''auteur ni de course.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.guard_payout_account_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_verifie boolean;
BEGIN
  IF v_uid IS NULL
     -- Contourner l'immuabilite d'un compte de versement est un pouvoir
     -- sur l'argent : il revient au metier qui approuve les retraits, et
     -- non plus a tout ancien moderateur.
     OR public.has_permission(v_uid, 'retraits.approuver') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Un compte de retrait ne peut pas changer de propriétaire.' USING ERRCODE = '42501';
  END IF;

  v_verifie := public.is_approved_runner(v_uid);

  IF NOT v_verifie THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Votre compte de réception a été vérifié : sa suppression passe par la modération.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF EXISTS (SELECT 1 FROM public.runner_payout_accounts a WHERE a.user_id = v_uid) THEN
      RAISE EXCEPTION 'Votre compte de réception a été vérifié : en ajouter un autre passe par la modération.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.provider       IS DISTINCT FROM OLD.provider
     OR NEW.account_number IS DISTINCT FROM OLD.account_number
     OR NEW.account_name   IS DISTINCT FROM OLD.account_name THEN
    RAISE EXCEPTION 'Votre compte de réception a été vérifié : sa modification passe par la modération.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.organisation_errands(p_org uuid, p_limit integer DEFAULT 100)
 RETURNS TABLE(id uuid, title text, category errand_category, city text, zone text, status errand_status, payment_status pay_status, total_amount numeric, service_fee numeric, created_at timestamp with time zone, demandeur text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_org_member(p_org, auth.uid())
     AND NOT public.has_permission(auth.uid(), 'organisations.lire') THEN
    RAISE EXCEPTION 'Vous n''appartenez pas à cette organisation.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.title, e.category, e.city, e.zone, e.status, e.payment_status,
         e.total_amount, e.service_fee, e.created_at,
         COALESCE(p.display_name, 'Membre retiré')
  FROM public.errands e
  LEFT JOIN public.profiles p ON p.id = e.customer_id
  WHERE e.organisation_id = p_org
  ORDER BY e.created_at DESC
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
END;
$function$
;


CREATE OR REPLACE FUNCTION public.payout_request_settle(p_request_id uuid, p_status payout_status, p_reference text DEFAULT NULL::text, p_note text DEFAULT NULL::text)
 RETURNS payout_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_request public.payout_requests;
BEGIN
  -- Le droit qui nomme ce geste existe au catalogue depuis le debut, et
  -- c'est le responsable financier qui le porte.
  IF NOT public.has_permission(auth.uid(), 'retraits.approuver') THEN
    RAISE EXCEPTION 'Seul un administrateur peut traiter une demande de retrait.' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('processing'::payout_status, 'paid'::payout_status, 'rejected'::payout_status) THEN
    RAISE EXCEPTION 'Statut de retrait invalide.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_request FROM public.payout_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande de retrait introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_request.status IN ('paid'::payout_status, 'rejected'::payout_status) THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée.' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'rejected'::payout_status THEN
    UPDATE public.runner_wallets
    SET available_balance = available_balance + v_request.amount
    WHERE user_id = v_request.user_id;

    INSERT INTO public.wallet_entries (user_id, kind, amount, label, released_at)
    VALUES (v_request.user_id, 'adjustment'::wallet_entry_kind, v_request.amount,
            'Retrait refusé, montant recrédité', now());
  END IF;

  UPDATE public.payout_requests SET
    status             = p_status,
    transfer_reference = COALESCE(p_reference, transfer_reference),
    admin_note         = COALESCE(p_note, admin_note)
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  PERFORM public.log_audit('settle', 'payout_request', p_request_id::text,
    jsonb_build_object('status', p_status, 'amount', v_request.amount, 'reference', p_reference));

  RETURN v_request;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.taches_planifiees()
 RETURNS TABLE(tache text, frequence text, active boolean, dernier_debut timestamp with time zone, dernier_statut text, dernier_message text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.start_time,
    d.status::text,
    left(d.return_message, 200)
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT r.start_time, r.status, r.return_message
    FROM cron.job_run_details r
    WHERE r.jobid = j.jobid
    ORDER BY r.start_time DESC
    LIMIT 1
  ) d ON true
  WHERE j.jobname LIKE 'akwaba-%'
    AND public.has_permission(auth.uid(), 'exploitation.sante')
  ORDER BY j.jobname;
$function$
;


-- ---------------------------------------------------------------------------
-- Ce que l'audit doit desormais surveiller
--
-- Une porte qui regarde le role herite ignore la matrice : ni le droit ni sa
-- portee ne s'appliquent, et les deux mesures existantes ne la voient pas,
-- puisqu'elles cherchent des droits mal branches et non des portes qui se
-- passent d'eux.
--
-- Quelques usages restent, et ils sont nommes ici plutot qu'exclus en silence.
-- Trois familles :
--
--   1. Les fonctions qui portent l'acces de secours lui-meme. has_permission,
--      has_scoped_permission et est_du_personnel doivent le lire : c'est leur
--      role.
--   2. Les politiques de user_roles, qui gouvernent la table du role herite.
--      Les ecrire en fonction de la matrice serait circulaire.
--   3. Trois suppressions et une creation qu'aucun droit du catalogue ne
--      nomme : effacer une fiche de lieu, effacer une preuve de course,
--      effacer l'image d'un lieu, et creer une fiche en tant que partenaire.
--      Les trois premieres restent au seul acces de secours plutot que d'etre
--      elargies a un droit approchant : elargir un pouvoir destructeur pour
--      faire taire une mesure serait exactement le contraire du travail fait
--      ici. La quatrieme repose sur le role applicatif « partner », qui dit ce
--      qu'une personne fait sur la plateforme et non ce qu'elle administre.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portes_au_role_herite()
RETURNS TABLE (genre text, objet text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT 'politique'::text, cl.relname::text, pol.polname::text
    FROM pg_policy pol
    JOIN pg_class cl ON cl.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
   WHERE n.nspname IN ('public', 'storage')
     AND (COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
          COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) LIKE '%has_role(%'
     AND (cl.relname, pol.polname) NOT IN (
       ('user_roles', 'Admins manage roles'),
       ('user_roles', 'Users can view own roles'),
       ('places', 'Admins can delete places'),
       ('places', 'Partners can create places'),
       ('objects', 'Errand proofs delete admin'),
       ('objects', 'Owners can delete their place images')
     )
  UNION ALL
  SELECT 'fonction'::text, p.proname::text, ''::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%has_role(%'
     AND p.proname NOT IN (
       'has_permission', 'has_scoped_permission', 'est_du_personnel',
       -- Celles-ci raisonnent sur l'acces de secours pour le rendre visible :
       -- la reconciliation le compare a la matrice, permissions_effectives le
       -- nomme comme source, mon_perimetre et staff_assign_role s'en servent
       -- pour ne pas enfermer le dernier administrateur hors de la console.
       'permissions_effectives', 'mon_perimetre', 'staff_assign_role',
       'gouvernance_reconciliation', 'gouvernance_sante', 'acces_a_revoir',
       'staff_set_permission', 'sync_legacy_staff_role'
     )
   ORDER BY 1, 2;
$fn$;

REVOKE ALL ON FUNCTION public.portes_au_role_herite() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portes_au_role_herite() TO authenticated;

COMMENT ON FUNCTION public.portes_au_role_herite() IS
  'Les portes qui decident d''un acces en lisant le role herite plutot que la matrice. Les exceptions legitimes sont nommees dans le corps.';
