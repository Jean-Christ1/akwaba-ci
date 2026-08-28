-- La portee annoncee restreint vraiment.
--
-- Le catalogue declare treize droits « restreignables a une ou plusieurs
-- villes », et le tiroir de la console le repete a qui les accorde. Onze ne
-- restreignaient rien.
--
-- La mesure est simple a refaire : la portee ne s'applique que si le controle
-- passe la ville a has_scoped_permission. Seuls courses.lire et
-- majoration.publier le faisaient. Partout ailleurs, le controle appelait
-- has_permission, qui repond « oui » sans regarder ou.
--
-- Concretement, un responsable recrute pour ouvrir Bouake tranchait les litiges
-- d'Abidjan, validait les shoppers de Yamoussoukro, corrigeait n'importe quelle
-- course et moderait toutes les fiches du pays. La restriction posee a
-- l'attribution etait une decoration.
--
-- Les fonctions sont reprises de leur definition en base, seule la ligne de
-- controle change. Les politiques sont reecrites entierement, ce qui est sans
-- risque : leur texte tient en quelques lignes et il est verifie par la recette.
--
-- Une remarque sur les demandes de visiteur : elles n'ont pas de ville a elles,
-- seulement celle de l'etablissement concerne. Une demande sans etablissement
-- n'appartient donc a aucune ville, et revient a quelqu'un qui n'est pas
-- restreint. C'est le comportement de has_scoped_permission avec une ville
-- nulle, et c'est celui qu'on veut : mieux vaut qu'une demande generale remonte
-- au national que de la laisser sans personne pour la traiter.


CREATE OR REPLACE FUNCTION public.errand_financement_resume(p_errand_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'mode', e.fund_mode,
    'budget_annonce', e.budget_estimate,
    'panier_soumis_le', e.basket_submitted_at,
    'panier_total', e.basket_total,
    'panier_valide_le', e.basket_approved_at,
    'panier_refuse_le', e.basket_rejected_at,
    'panier_motif', e.basket_note,
    'avance_declaree', e.advance_declared_amount,
    'avance_declaree_le', e.advance_declared_at,
    'avance_confirmee', e.advance_amount,
    'avance_confirmee_le', e.advance_confirmed_at,
    'achats_reels', e.items_total,
    'plafond_du_shopper', public.runner_advance_ceiling(e.runner_id),
    'palier_du_shopper', (public.runner_trust_level(e.runner_id)).libelle,
    -- La question que le moderateur se pose en premier : le client avait-il
    -- approuve ce qu'il conteste aujourd'hui ?
    'client_avait_approuve', e.basket_approved_at IS NOT NULL
  )
  FROM public.errands e
  WHERE e.id = p_errand_id
    AND (public.has_scoped_permission(auth.uid(), 'litiges.lire', e.city)
         OR e.customer_id = auth.uid()
         OR e.runner_id = auth.uid());
$function$
;


CREATE OR REPLACE FUNCTION public.errand_resolve_dispute(p_errand_id uuid, p_issue text, p_note text DEFAULT NULL::text)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errand     public.errands;
  v_rendu      numeric(12,2) := 0;
  v_commission numeric(12,2) := 0;
  v_deja_paye  boolean;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  -- La ville de la course, sans quoi la restriction annoncee au catalogue
  -- ne restreint rien : un responsable d'une seule ville tranchait partout.
  IF NOT public.has_scoped_permission(auth.uid(), 'litiges.trancher',
         (SELECT city FROM public.errands WHERE id = p_errand_id)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut trancher un litige.' USING ERRCODE = '42501';
  END IF;

  IF p_issue NOT IN ('shopper', 'client', 'annulation') THEN
    RAISE EXCEPTION 'Issue de litige inconnue.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_errand FROM public.errands WHERE id = p_errand_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_errand.status <> 'disputed'::errand_status THEN
    RAISE EXCEPTION 'Cette course n''est pas en litige.' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  SELECT COALESCE(-sum(amount), 0) INTO v_rendu
  FROM public.wallet_entries
  WHERE errand_id = p_errand_id AND kind = 'adjustment'::wallet_entry_kind;
  v_rendu := GREATEST(v_rendu, 0);

  -- La course a-t-elle déjà été clôturée financièrement ? Un litige ouvert
  -- avant tout règlement n'a rien à lever : il a tout à verser.
  SELECT EXISTS (
    SELECT 1 FROM public.wallet_entries
    WHERE errand_id = p_errand_id
      AND kind IN ('earning'::wallet_entry_kind,
                   'commission'::wallet_entry_kind,
                   'commission_due'::wallet_entry_kind)
  ) INTO v_deja_paye;

  IF p_issue = 'shopper' THEN
    IF v_errand.runner_id IS NOT NULL AND v_rendu > 0 THEN
      UPDATE public.runner_wallets
      SET available_balance = available_balance + v_rendu
      WHERE user_id = v_errand.runner_id;

      INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
      VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind, v_rendu,
              'Litige tranché en votre faveur', now());
    END IF;

    UPDATE public.errands
    SET status = 'completed'::errand_status, payment_status = 'paid'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

    -- Le point ajouté : marquer « payée » une course jamais réglée revenait à
    -- clore le dossier sur un paiement qui n'a pas eu lieu, sans plus aucun
    -- moyen de le rattraper.
    IF NOT v_deja_paye THEN
      PERFORM public.errand_settle_runner(p_errand_id);
    END IF;

  ELSIF p_issue = 'client' THEN
    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'refunded'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;

  ELSE
    IF v_errand.runner_id IS NOT NULL THEN
      IF v_rendu > 0 THEN
        UPDATE public.runner_wallets
        SET available_balance = available_balance + v_rendu
        WHERE user_id = v_errand.runner_id;

        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'adjustment'::wallet_entry_kind, v_rendu,
                'Litige clos sans versement, gel levé', now());
      END IF;

      SELECT COALESCE(-sum(amount), 0) INTO v_commission
      FROM public.wallet_entries
      WHERE errand_id = p_errand_id AND kind = 'commission_due'::wallet_entry_kind;

      IF v_commission > 0 THEN
        UPDATE public.runner_wallets
        SET commission_due = GREATEST(commission_due - v_commission, 0)
        WHERE user_id = v_errand.runner_id;

        INSERT INTO public.wallet_entries (user_id, errand_id, kind, amount, label, released_at)
        VALUES (v_errand.runner_id, v_errand.id, 'commission_due'::wallet_entry_kind, v_commission,
                'Commission annulée, litige clos sans versement', now());
      END IF;
    END IF;

    UPDATE public.errands
    SET status = 'cancelled'::errand_status, payment_status = 'failed'::pay_status
    WHERE id = p_errand_id
    RETURNING * INTO v_errand;
  END IF;

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    CASE p_issue
      WHEN 'shopper' THEN 'Litige tranché en faveur du shopper'
      WHEN 'client' THEN 'Litige tranché en faveur du client'
      ELSE 'Litige clos sans versement'
    END ||
    CASE WHEN p_note IS NOT NULL THEN ' : ' || left(trim(p_note), 400) ELSE '' END);

  PERFORM public.log_audit('resolve', 'dispute', p_errand_id::text,
    jsonb_build_object('issue', p_issue, 'rendu', v_rendu,
                       'commission_annulee', v_commission, 'cloture_effectuee', NOT v_deja_paye));

  RETURN v_errand;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.errand_unlock_handover(p_errand_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS errands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_errand public.errands;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  -- La ville de la course, sans quoi la restriction annoncee au catalogue
  -- ne restreint rien.
  IF NOT public.has_scoped_permission(auth.uid(), 'courses.deverrouiller',
         (SELECT city FROM public.errands WHERE id = p_errand_id)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir une remise verrouillée.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.errand_engine', 'on', true);

  UPDATE public.errands SET
    handover_attempts  = 0,
    handover_locked_at = NULL
  WHERE id = p_errand_id
  RETURNING * INTO v_errand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = 'P0002';
  END IF;

  -- Le marqueur du moteur est propre à la transaction : celui qui l'arme le
  -- désarme, sinon il reste ouvert pour tout ce qui suit dans la même
  -- transaction.
  PERFORM set_config('app.errand_engine', 'off', true);

  PERFORM public.log_errand_event(p_errand_id, v_errand.status,
    'Remise rouverte par la modération' ||
    CASE WHEN p_reason IS NOT NULL THEN ' : ' || left(trim(p_reason), 300) ELSE '' END);

  PERFORM public.log_audit('unlock', 'errand_handover', p_errand_id::text,
    jsonb_build_object('motif', COALESCE(NULLIF(trim(p_reason), ''), 'non precise')));

  RETURN v_errand;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.lead_note_interne(p_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_demande public.leads;
  v_lieu    public.places;
BEGIN
  SELECT * INTO v_demande FROM public.leads WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lieu FROM public.places WHERE id = v_demande.place_id;

  IF NOT (
    COALESCE(v_lieu.owner_id = v_uid, false)
    -- La ville de l'etablissement concerne. Une demande sans etablissement
    -- n'appartient a aucune ville : elle revient a qui n'est pas restreint.
    OR public.has_scoped_permission(v_uid, 'lieux.moderer', v_lieu.city)
    OR public.has_scoped_permission(v_uid, 'demandes.traiter', v_lieu.city)
  ) THEN
    RAISE EXCEPTION 'Cette note ne vous concerne pas.' USING ERRCODE = '42501';
  END IF;

  RETURN v_demande.partner_note;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.lead_traiter(p_id uuid, p_status lead_status DEFAULT NULL::lead_status, p_note text DEFAULT NULL::text, p_reponse text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_demande public.leads;
  v_lieu    public.places;
  v_avant   public.lead_status;
BEGIN
  SELECT * INTO v_demande FROM public.leads WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_lieu FROM public.places WHERE id = v_demande.place_id;

  -- Le propriétaire de l'établissement concerné, ou le personnel. Le visiteur
  -- qui a envoyé la demande, lui, n'a rien à y changer : ce qu'il a écrit fait
  -- foi, et pouvoir le réécrire après coup viderait la trace de son sens.
  IF NOT (
    COALESCE(v_lieu.owner_id = v_uid, false)
    -- La ville de l'etablissement concerne. Une demande sans etablissement
    -- n'appartient a aucune ville : elle revient a qui n'est pas restreint.
    OR public.has_scoped_permission(v_uid, 'lieux.moderer', v_lieu.city)
    OR public.has_scoped_permission(v_uid, 'demandes.traiter', v_lieu.city)
  ) THEN
    RAISE EXCEPTION 'Cette demande ne concerne pas votre établissement.' USING ERRCODE = '42501';
  END IF;

  v_avant := v_demande.status;

  UPDATE public.leads SET
    status       = COALESCE(p_status, status),
    partner_note = COALESCE(NULLIF(btrim(COALESCE(p_note, '')), ''), partner_note),
    partner_reply = CASE
      WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL
        THEN left(btrim(p_reponse), 4000)
      ELSE partner_reply
    END,
    replied_at = CASE
      WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL THEN now()
      ELSE replied_at
    END,
    replied_by = CASE
      WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL THEN v_uid
      ELSE replied_by
    END,
    updated_at = now()
  WHERE id = p_id
  RETURNING * INTO v_demande;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'lead_traiter', 'lead', p_id::text,
          jsonb_build_object('statut_avant', v_avant, 'statut_apres', v_demande.status,
                             'reponse', NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL));

  -- Le visiteur est prévenu quand quelque chose le concerne : une réponse
  -- écrite, ou un changement d'état qu'il attend. Une note interne, non : elle
  -- ne lui est pas destinée, et la lui envoyer serait une fuite.
  IF v_demande.user_id IS NOT NULL
     AND (NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL
          OR (p_status IS NOT NULL AND p_status IS DISTINCT FROM v_avant
              AND p_status IN ('contacted'::lead_status, 'closed'::lead_status))) THEN
    PERFORM public.notify_enqueue(
      v_demande.user_id,
      NULL,
      'lead_reponse',
      format('%s a répondu à votre demande', COALESCE(v_lieu.name, 'L''établissement')),
      CASE
        WHEN NULLIF(btrim(COALESCE(p_reponse, '')), '') IS NOT NULL
          THEN left(btrim(p_reponse), 1200)
        WHEN v_demande.status = 'contacted'::lead_status
          THEN 'Votre demande a été prise en charge. L''établissement vous recontacte directement.'
        ELSE 'Votre demande a été clôturée par l''établissement.'
      END
    );
  END IF;

  RETURN jsonb_build_object('id', p_id, 'status', v_demande.status,
                            'repondu', v_demande.replied_at IS NOT NULL);
END;
$function$
;


CREATE OR REPLACE FUNCTION public.runner_identity_reopen(p_user_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS runner_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_profil public.runner_profiles;
BEGIN
  -- Le droit de la matrice, et non plus le seul role herite : ce que la
  -- console affiche doit etre ce que le serveur applique.
  -- La ville du shopper, sans quoi la restriction annoncee ne restreint rien.
  IF NOT public.has_scoped_permission(auth.uid(), 'shoppers.valider',
         (SELECT city FROM public.runner_profiles WHERE user_id = p_user_id)) THEN
    RAISE EXCEPTION 'Seul un modérateur peut rouvrir un dossier d''identité.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.runner_profiles SET
    status = 'pending'::runner_status
  WHERE user_id = p_user_id
  RETURNING * INTO v_profil;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  PERFORM public.log_audit('reopen', 'runner_identity', p_user_id::text,
    jsonb_build_object('motif', left(COALESCE(trim(p_reason), ''), 300)));

  RETURN v_profil;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.runner_set_status(p_runner_id uuid, p_status runner_status, p_reason text DEFAULT NULL::text)
 RETURNS runner_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_moi     uuid := auth.uid();
  v_avant   public.runner_profiles;
  v_apres   public.runner_profiles;
  v_manques text[];
  v_droit   text;
BEGIN
  v_droit := CASE p_status
    WHEN 'approved'::runner_status  THEN 'shoppers.valider'
    WHEN 'rejected'::runner_status  THEN 'shoppers.valider'
    ELSE 'shoppers.suspendre'
  END;

  -- La ville du shopper, sans quoi la restriction annoncee ne restreint rien.
  IF NOT public.has_scoped_permission(v_moi, v_droit,
         (SELECT city FROM public.runner_profiles WHERE id = p_runner_id)) THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de prendre cette decision sur un shopper.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_avant FROM public.runner_profiles WHERE id = p_runner_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dossier de shopper introuvable.' USING ERRCODE = 'P0002';
  END IF;

  IF v_avant.status = p_status THEN
    -- Rien ne change : ne pas inscrire une décision qui n'a pas eu lieu.
    RETURN v_avant;
  END IF;

  -- Suspendre ou refuser prive quelqu'un de son revenu : le motif est exigé,
  -- alors qu'une validation se suffit à elle-même.
  IF p_status IN ('suspended'::runner_status, 'rejected'::runner_status)
     AND char_length(btrim(COALESCE(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Indiquez le motif de la suspension ou du refus.' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'approved'::runner_status THEN
    v_manques := public.runner_identity_gaps(v_avant);
    IF array_length(v_manques, 1) > 0 THEN
      RAISE EXCEPTION 'Ce dossier ne peut pas encore etre valide. Il manque : %.',
        array_to_string(v_manques, ', ') USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.runner_profiles
  SET status = p_status,
      identity_reviewed_at = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN now() ELSE identity_reviewed_at END,
      identity_reviewed_by = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN v_moi ELSE identity_reviewed_by END,
      identity_review_note = CASE
        WHEN p_status IN ('approved'::runner_status, 'rejected'::runner_status)
        THEN NULLIF(btrim(COALESCE(p_reason, '')), '') ELSE identity_review_note END
  WHERE id = p_runner_id
  RETURNING * INTO v_apres;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_moi, 'set_status', 'runner_profile', p_runner_id::text,
          jsonb_build_object(
            'avant', v_avant.status,
            'apres', p_status,
            'droit', v_droit,
            'motif', COALESCE(NULLIF(btrim(p_reason), ''), 'non precise')));

  RETURN v_apres;
END;
$function$
;


CREATE OR REPLACE FUNCTION public.guard_errand_privileged_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  -- Les seules colonnes qu'une écriture directe peut changer. Tout le reste
  -- appartient au moteur.
  v_libres  text[] := ARRAY['updated_at'];
  v_avant   jsonb;
  v_apres   jsonb;
  v_touchee text;
BEGIN
  IF current_setting('app.errand_engine', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- Anonymisation par cascade : le client disparaît, la course et sa trace
  -- comptable demeurent. Aucun montant, aucun statut, aucune affectation ne
  -- bouge, sans quoi on retombe dans le cas général ci-dessous.
  IF NEW.customer_id IS NULL AND OLD.customer_id IS NOT NULL
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status
     AND NEW.runner_id IS NOT DISTINCT FROM OLD.runner_id
     AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount
     AND NEW.commission_amount IS NOT DISTINCT FROM OLD.commission_amount
     AND NEW.runner_payout IS NOT DISTINCT FROM OLD.runner_payout THEN
    RETURN NEW;
  END IF;

  -- Le droit de la matrice, et non plus le seul rôle hérité : ce que la console
  -- affiche doit être ce que le serveur applique.
  IF public.has_scoped_permission(auth.uid(), 'courses.corriger', NEW.city) THEN
    RETURN NEW;
  END IF;

  v_avant := to_jsonb(OLD);
  v_apres := to_jsonb(NEW);

  SELECT cle
  INTO v_touchee
  FROM jsonb_object_keys(v_apres) AS cle
  WHERE NOT (cle = ANY (v_libres))
    AND v_apres -> cle IS DISTINCT FROM v_avant -> cle
  LIMIT 1;

  IF v_touchee IS NOT NULL THEN
    -- Le message nomme la colonne : un développeur qui heurte la garde doit
    -- savoir laquelle, sans avoir à deviner.
    RAISE EXCEPTION
      'Les montants, le statut, l''affectation et les preuves d''une course sont gérés par la plateforme et ne peuvent pas être modifiés directement (colonne « % »).',
      v_touchee
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$
;


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
  IF public.has_scoped_permission(auth.uid(), 'lieux.moderer', NEW.city) THEN
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
$function$
;


-- ---------------------------------------------------------------------------
-- Les politiques
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view published places" ON public.places;
CREATE POLICY "Anyone can view published places" ON public.places
  FOR SELECT TO anon, authenticated
  USING (
    status = 'published'::place_status
    OR auth.uid() = owner_id
    OR public.has_scoped_permission(auth.uid(), 'lieux.lire', city)
  );

DROP POLICY IF EXISTS "Owners and admins can update places" ON public.places;
CREATE POLICY "Owners and admins can update places" ON public.places
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id OR public.has_scoped_permission(auth.uid(), 'lieux.moderer', city))
  WITH CHECK (auth.uid() = owner_id OR public.has_scoped_permission(auth.uid(), 'lieux.moderer', city));

DROP POLICY IF EXISTS "Demandes lisibles par ceux qu'elles concernent" ON public.leads;
CREATE POLICY "Demandes lisibles par ceux qu'elles concernent" ON public.leads
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.places p WHERE p.id = leads.place_id AND p.owner_id = auth.uid())
    -- La ville vient de l'etablissement concerne, la demande n'en portant pas.
    OR public.has_scoped_permission(auth.uid(), 'lieux.moderer',
         (SELECT p.city FROM public.places p WHERE p.id = leads.place_id))
    OR public.has_scoped_permission(auth.uid(), 'demandes.traiter',
         (SELECT p.city FROM public.places p WHERE p.id = leads.place_id))
  );

DROP POLICY IF EXISTS "Marchands lisibles par les leurs" ON public.merchant_accounts;
CREATE POLICY "Marchands lisibles par les leurs" ON public.merchant_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'marchands.gerer')
    OR public.has_scoped_permission(auth.uid(), 'paiements.comptoir.lire', ville)
  );

DROP POLICY IF EXISTS "Paiements au comptoir de ma course" ON public.counter_payments;
CREATE POLICY "Paiements au comptoir de ma course" ON public.counter_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.errands e
             WHERE e.id = counter_payments.errand_id
               AND (e.customer_id = auth.uid() OR e.runner_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM public.merchant_accounts m
                WHERE m.id = counter_payments.merchant_id AND m.user_id = auth.uid())
    -- La ville vient de la course encaissee, le paiement n'en portant pas.
    OR public.has_scoped_permission(auth.uid(), 'paiements.comptoir.lire',
         (SELECT e.city FROM public.errands e WHERE e.id = counter_payments.errand_id))
  );

DROP POLICY IF EXISTS "Runner profile read access" ON public.runner_profiles;
CREATE POLICY "Runner profile read access" ON public.runner_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_scoped_permission(auth.uid(), 'shoppers.lire', city)
    OR EXISTS (SELECT 1 FROM public.errands e
                WHERE e.runner_id = runner_profiles.user_id AND e.customer_id = auth.uid())
  );

-- La modification d'un dossier de shopper regardait encore les deux roles
-- herites, alors que le geste normal passe par runner_set_status. Elle passe
-- par la matrice comme le reste.
DROP POLICY IF EXISTS "Runner updates own profile" ON public.runner_profiles;
CREATE POLICY "Runner updates own profile" ON public.runner_profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_scoped_permission(auth.uid(), 'shoppers.valider', city));

DROP POLICY IF EXISTS "Majorations en cours lisibles" ON public.pricing_surges;
CREATE POLICY "Majorations en cours lisibles" ON public.pricing_surges
  FOR SELECT TO anon, authenticated
  USING (
    (actif AND fin > now())
    OR public.has_scoped_permission(auth.uid(), 'majoration.publier', city_slug)
    OR public.has_permission(auth.uid(), 'bareme.publier')
  );

-- ---------------------------------------------------------------------------
-- Ce que l'audit doit desormais surveiller
--
-- Un droit dont la portee est annoncee et jamais appliquee promet une
-- restriction qui n'existe pas. C'est la meme tromperie qu'un droit que rien ne
-- consulte, un cran plus loin : la porte s'ouvre bien, mais elle s'ouvre
-- partout.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.portees_qui_ne_restreignent_pas()
RETURNS TABLE (code text, libelle text, sensible boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_source text;
BEGIN
  -- On ne retient que les endroits ou la ville est effectivement passee : un
  -- appel a has_permission dans la meme fonction ne compte pas.
  SELECT COALESCE(string_agg(p.prosrc, ' '), '') INTO v_source
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.prosrc ILIKE '%has_scoped_permission%';

  SELECT v_source || ' ' || COALESCE(string_agg(
           COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ' '), '')
    INTO v_source
    FROM pg_policy pol
   WHERE (COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
          COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) ILIKE '%has_scoped_permission%';

  RETURN QUERY
  SELECT p.code, p.libelle, p.sensible
    FROM public.permissions p
   WHERE p.portee = 'ville'
     AND position('''' || p.code || '''' in v_source) = 0
   ORDER BY p.sensible DESC, p.position;
END;
$fn$;

REVOKE ALL ON FUNCTION public.portees_qui_ne_restreignent_pas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.portees_qui_ne_restreignent_pas() TO authenticated;

COMMENT ON FUNCTION public.portees_qui_ne_restreignent_pas() IS
  'Les droits dont le catalogue annonce une restriction par ville qu''aucun controle n''applique.';
