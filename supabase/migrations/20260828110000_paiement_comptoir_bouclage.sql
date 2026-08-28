-- Bouclage du paiement au comptoir : ce que la première revue n'avait pas
-- encore atteint.
--
-- Sept points, tous vérifiés contre la base avant d'être corrigés ici.
--
-- 1. Un marchand payé par virement bancaire faisait échouer la validation. Le
--    type momo_provider connaît « bank », le type pay_method non : la
--    conversion levait une erreur. Et elle la levait au pire moment, au
--    comptoir, une fois les courses dans le panier.
--
-- 2. Les trois passages qui marquaient un code « expiré » avant de lever une
--    exception ne persistaient rien : le RAISE annule la transaction, donc
--    l'écriture avec elle. Le code écrivait une chose et en faisait une autre.
--
-- 3. Ni la demande ni la validation ne regardaient l'état de la course. Une
--    course annulée, livrée ou en litige laissait passer un encaissement.
--
-- 4. Le marchand n'était plus revérifié au moment de la validation, seul moment
--    où l'argent est réellement engagé. Un marchand suspendu entre les deux
--    encaissait quand même.
--
-- 5. Annuler une course laissait un paiement en attente de décision derrière
--    elle, sur une course qui n'existe plus.
--
-- 6. Annuler un paiement déjà refusé ou expiré était accepté, ce qui effaçait
--    la trace de ce qui s'était réellement passé.
--
-- 7. Le montant validé au comptoir n'alimentait pas advance_amount. Le
--    règlement final ignorait donc que le panier était déjà financé, et le
--    client risquait de le payer une seconde fois.

-- ---------------------------------------------------------------------------
-- 1. Comment un marchand est réglé, et ce que la course peut en dire
--
-- La conversion d'un moyen d'encaissement vers un moyen de paiement est écrite
-- une fois, au lieu d'être supposée à chaque appel. Le virement bancaire n'a
-- pas d'équivalent : la fonction le dit plutôt que de lever une erreur de type.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.moyen_vers_pay_method(p_moyen public.momo_provider)
RETURNS public.pay_method
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_moyen
    WHEN 'wave'         THEN 'wave'::public.pay_method
    WHEN 'orange_money' THEN 'orange_money'::public.pay_method
    WHEN 'mtn_momo'     THEN 'mtn_momo'::public.pay_method
    WHEN 'moov_money'   THEN 'moov_money'::public.pay_method
    ELSE NULL
  END;
$fn$;

COMMENT ON FUNCTION public.moyen_vers_pay_method(public.momo_provider) IS
  'Rend NULL pour « bank » : le paiement au comptoir ne sait pas encore regler un virement bancaire.';

-- ---------------------------------------------------------------------------
-- 2. Inscrire un marchand : refuser tôt ce qui ne pourra pas aboutir
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merchant_enregistrer(
  p_nom      text,
  p_moyen    public.momo_provider,
  p_numero   text,
  p_ville    text DEFAULT NULL,
  p_place_id uuid DEFAULT NULL,
  p_user_id  uuid DEFAULT NULL,
  p_verifier boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_marchand public.merchant_accounts;
BEGIN
  IF NOT public.has_permission(v_uid, 'marchands.gerer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de tenir le registre des marchands.'
      USING ERRCODE = '42501';
  END IF;

  -- Refuser ici plutôt qu'au comptoir : découvrir l'impossibilité une fois le
  -- panier rempli, avec la file derrière soi, coûte bien plus cher.
  IF public.moyen_vers_pay_method(p_moyen) IS NULL THEN
    RAISE EXCEPTION 'Le paiement au comptoir ne sait pas encore régler un marchand par virement bancaire. Choisissez un moyen mobile.'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.merchant_accounts (nom, ville, place_id, user_id, moyen, numero,
                                        verifie_le, verifie_par)
  VALUES (btrim(p_nom), p_ville, p_place_id, p_user_id, p_moyen, btrim(p_numero),
          CASE WHEN p_verifier THEN now() END,
          CASE WHEN p_verifier THEN v_uid END)
  ON CONFLICT (moyen, numero) DO UPDATE SET
    nom = EXCLUDED.nom,
    ville = COALESCE(EXCLUDED.ville, public.merchant_accounts.ville),
    place_id = COALESCE(EXCLUDED.place_id, public.merchant_accounts.place_id),
    user_id = COALESCE(EXCLUDED.user_id, public.merchant_accounts.user_id),
    updated_at = now(),
    verifie_le = COALESCE(EXCLUDED.verifie_le, public.merchant_accounts.verifie_le),
    verifie_par = COALESCE(EXCLUDED.verifie_par, public.merchant_accounts.verifie_par)
  RETURNING * INTO v_marchand;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'merchant_enregistrer', 'merchant_account', v_marchand.id::text,
          jsonb_build_object('nom', v_marchand.nom, 'verifie', v_marchand.verifie_le IS NOT NULL));

  RETURN jsonb_build_object('id', v_marchand.id, 'nom', v_marchand.nom,
                            'ville', v_marchand.ville, 'moyen', v_marchand.moyen,
                            'actif', v_marchand.actif,
                            'verifie', v_marchand.verifie_le IS NOT NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Rattacher un compte à un marchand
--
-- Sans rattachement, aucun commerçant ne peut atteindre son comptoir : la
-- politique de lecture ne lui montre que ses propres comptes, et la console
-- n'en rattachait aucun. Le registre existait, mais personne ne pouvait s'en
-- servir.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merchant_rattacher(p_id uuid, p_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_compte   uuid;
  v_marchand public.merchant_accounts;
BEGIN
  IF NOT public.has_permission(v_uid, 'marchands.gerer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de tenir le registre des marchands.'
      USING ERRCODE = '42501';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    -- Détacher est une opération légitime : un commerçant change de gérant.
    UPDATE public.merchant_accounts SET user_id = NULL, updated_at = now()
     WHERE id = p_id RETURNING * INTO v_marchand;
  ELSE
    SELECT id INTO v_compte FROM auth.users WHERE lower(email) = lower(btrim(p_email));
    IF v_compte IS NULL THEN
      RAISE EXCEPTION 'Aucun compte Akwaba avec cette adresse. Le commerçant doit d''abord créer son compte.'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.merchant_accounts SET user_id = v_compte, updated_at = now()
     WHERE id = p_id RETURNING * INTO v_marchand;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marchand introuvable.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'merchant_rattacher', 'merchant_account', p_id::text,
          jsonb_build_object('rattache', v_compte IS NOT NULL, 'nom', v_marchand.nom));

  RETURN jsonb_build_object('id', p_id, 'rattache', v_marchand.user_id IS NOT NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION public.merchant_rattacher(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_rattacher(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Une vérification commune, appelée aux deux moments qui comptent
--
-- Vérifier à la demande ne suffit pas : l'argent n'est engagé qu'à la
-- validation, et tout peut avoir changé entre les deux.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_verifier_beneficiaire(
  p_merchant_id uuid,
  p_errand_id   uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_marchand public.merchant_accounts;
  v_course   public.errands;
BEGIN
  SELECT * INTO v_marchand FROM public.merchant_accounts WHERE id = p_merchant_id;
  IF NOT FOUND OR NOT v_marchand.actif THEN
    RAISE EXCEPTION 'Ce marchand n''est pas actif.' USING ERRCODE = '22023';
  END IF;
  IF v_marchand.verifie_le IS NULL THEN
    RAISE EXCEPTION 'Ce marchand n''est pas encore vérifié : il ne peut pas encaisser.'
      USING ERRCODE = '42501';
  END IF;
  IF public.moyen_vers_pay_method(v_marchand.moyen) IS NULL THEN
    RAISE EXCEPTION 'Le paiement au comptoir ne sait pas encore régler ce marchand par virement bancaire.'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_course FROM public.errands WHERE id = p_errand_id;

  IF v_marchand.user_id IS NOT NULL AND v_marchand.user_id = v_course.runner_id THEN
    RAISE EXCEPTION 'Le shopper de la course ne peut pas en être le bénéficiaire.'
      USING ERRCODE = '42501';
  END IF;
  IF v_marchand.user_id IS NOT NULL AND v_marchand.user_id = v_course.customer_id THEN
    RAISE EXCEPTION 'Le client ne peut pas se payer lui-même.' USING ERRCODE = '42501';
  END IF;

  -- Le numéro compte autant que le compte : la console ne rattache pas
  -- systématiquement, et un shopper peut inscrire son propre numéro Wave.
  --
  -- On regarde aussi le shopper de l'offre acceptée, et pas seulement
  -- runner_id : une annulation remet runner_id à NULL, ce qui suffirait à
  -- désarmer la comparaison sur une course qu'on vient de quitter.
  IF EXISTS (
    SELECT 1 FROM public.runner_payout_accounts a
     WHERE (
       a.user_id IN (v_course.runner_id, v_course.customer_id)
       OR a.user_id IN (
         SELECT o.runner_id FROM public.errand_offers o
          WHERE o.errand_id = p_errand_id AND o.status = 'accepted'::offer_status
       )
     )
       AND a.provider = v_marchand.moyen
       AND regexp_replace(a.account_number, '\D', '', 'g')
         = regexp_replace(v_marchand.numero, '\D', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Ce numéro d''encaissement est celui du shopper ou du client de la course.'
      USING ERRCODE = '42501';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_verifier_beneficiaire(uuid, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.counter_payment_exiger_course_vivante(p_errand_id uuid)
RETURNS public.errands
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_course public.errands;
BEGIN
  SELECT * INTO v_course FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = '22023';
  END IF;
  -- Une course annulée, livrée, terminée ou en litige n'a plus d'achats à
  -- financer. Sans ce contrôle, un code émis plus tôt continuait de valoir.
  IF v_course.status NOT IN ('assigned'::errand_status, 'shopping'::errand_status) THEN
    RAISE EXCEPTION 'Cette course n''est plus en cours : aucun paiement au comptoir n''est possible.'
      USING ERRCODE = '22023';
  END IF;
  RETURN v_course;
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_exiger_course_vivante(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 5. Lire : ne plus écrire une expiration que le RAISE annule
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_lire(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_paiement public.counter_payments;
  v_course   public.errands;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Connectez-vous pour lire un code de paiement.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_paiement FROM public.counter_payments
   WHERE code_hash = encode(digest(upper(btrim(p_code)), 'sha256'), 'hex');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce code ne correspond à aucun paiement.' USING ERRCODE = '22023';
  END IF;

  -- On ne marque plus l'expiration ici. Le RAISE qui suivait annulait la
  -- transaction, donc l'écriture avec elle : le code prétendait ranger la
  -- ligne et ne rangeait rien. Le travail planifié s'en charge toutes les cinq
  -- minutes, et lui va au bout.
  IF v_paiement.expire_le < now() THEN
    RAISE EXCEPTION 'Ce code a expiré.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable : il est %.',
      public.counter_payment_etat_libelle(v_paiement.etat) USING ERRCODE = '22023';
  END IF;

  v_course := public.counter_payment_exiger_course_vivante(v_paiement.errand_id);

  UPDATE public.counter_payments SET presente_le = COALESCE(presente_le, now())
   WHERE id = v_paiement.id;

  RETURN jsonb_build_object(
    'id', v_paiement.id,
    'reference', left(v_paiement.errand_id::text, 8),
    'intitule', v_course.title,
    'ville', v_course.city,
    'plafond', v_paiement.plafond,
    'expire_le', v_paiement.expire_le
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_lire(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_lire(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Demander : course vivante, bénéficiaire vérifié
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_demander(
  p_code        text,
  p_montant     numeric,
  p_merchant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_paiement public.counter_payments;
  v_course   public.errands;
  v_marchand public.merchant_accounts;
BEGIN
  SELECT * INTO v_paiement FROM public.counter_payments
   WHERE code_hash = encode(digest(upper(btrim(p_code)), 'sha256'), 'hex')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce code ne correspond à aucun paiement.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.expire_le < now() THEN
    RAISE EXCEPTION 'Ce code a expiré.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable : il est %.',
      public.counter_payment_etat_libelle(v_paiement.etat) USING ERRCODE = '22023';
  END IF;

  v_course := public.counter_payment_exiger_course_vivante(v_paiement.errand_id);

  SELECT * INTO v_marchand FROM public.merchant_accounts WHERE id = p_merchant_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce marchand n''est pas actif.' USING ERRCODE = '22023';
  END IF;

  IF v_marchand.user_id IS DISTINCT FROM v_uid
     AND NOT public.has_permission(v_uid, 'paiements.comptoir.saisir') THEN
    RAISE EXCEPTION 'Seul le marchand peut demander son encaissement.' USING ERRCODE = '42501';
  END IF;

  PERFORM public.counter_payment_verifier_beneficiaire(p_merchant_id, v_paiement.errand_id);

  IF p_montant IS NULL OR p_montant <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif.' USING ERRCODE = '22023';
  END IF;
  IF p_montant > v_paiement.plafond THEN
    RAISE EXCEPTION 'Le montant dépasse le plafond autorisé par le client (% FCFA).',
      to_char(v_paiement.plafond, 'FM999G999G999') USING ERRCODE = '22023';
  END IF;

  UPDATE public.counter_payments SET
    etat = 'a_valider',
    montant = round(p_montant, 2),
    merchant_id = p_merchant_id,
    demande_le = now()
  WHERE id = v_paiement.id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_demander', 'counter_payment', v_paiement.id::text,
          jsonb_build_object('montant', p_montant, 'merchant_id', p_merchant_id));

  PERFORM public.notify_enqueue(
    v_course.customer_id,
    v_course.id,
    'counter_payment_demande',
    format('Paiement à valider : %s FCFA', to_char(round(p_montant, 2), 'FM999G999G999')),
    format('%s demande %s FCFA pour votre course « %s ». Validez ou refusez depuis l''application.',
           v_marchand.nom, to_char(round(p_montant, 2), 'FM999G999G999'), v_course.title)
  );

  RETURN jsonb_build_object('id', v_paiement.id, 'etat', 'a_valider',
                            'montant', round(p_montant, 2), 'marchand', v_marchand.nom);
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_demander(text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_demander(text, numeric, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Décider : revérifier, et faire compter l'argent déjà avancé
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_decider(
  p_id      uuid,
  p_accepte boolean,
  p_motif   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_paiement public.counter_payments;
  v_course   public.errands;
  v_marchand public.merchant_accounts;
  v_montant  text;
BEGIN
  SELECT * INTO v_paiement FROM public.counter_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_course FROM public.errands WHERE id = v_paiement.errand_id;

  IF v_course.customer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Seul le client de la course peut valider ce paiement.' USING ERRCODE = '42501';
  END IF;

  IF v_paiement.etat <> 'a_valider' THEN
    RAISE EXCEPTION 'Ce paiement n''attend pas de décision : il est %.',
      public.counter_payment_etat_libelle(v_paiement.etat) USING ERRCODE = '22023';
  END IF;

  IF v_paiement.expire_le < now() THEN
    RAISE EXCEPTION 'Ce paiement a expiré avant votre décision.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_marchand FROM public.merchant_accounts WHERE id = v_paiement.merchant_id;
  v_montant := to_char(v_paiement.montant, 'FM999G999G999');

  IF NOT p_accepte THEN
    UPDATE public.counter_payments SET
      etat = 'refuse', decide_le = now(), motif = left(btrim(COALESCE(p_motif, '')), 300)
    WHERE id = p_id;

    INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
    VALUES (v_uid, 'counter_payment_refuser', 'counter_payment', p_id::text,
            jsonb_build_object('montant', v_paiement.montant, 'motif', p_motif));

    IF v_course.runner_id IS NOT NULL THEN
      PERFORM public.notify_enqueue(
        v_course.runner_id, v_course.id, 'counter_payment_refuse',
        'Paiement refusé par le client',
        format('Le client a refusé le paiement de %s FCFA. Ne réglez rien de votre poche : prévenez le support.',
               v_montant)
      );
    END IF;

    IF v_marchand.user_id IS NOT NULL THEN
      PERFORM public.notify_enqueue(
        v_marchand.user_id, v_course.id, 'counter_payment_refuse_marchand',
        'Demande refusée par le client',
        format('Le client a refusé votre demande de %s FCFA. Ne remettez pas la marchandise.', v_montant)
      );
    END IF;

    RETURN jsonb_build_object('id', p_id, 'etat', 'refuse');
  END IF;

  -- L'argent n'est engagé qu'ici. C'est donc ici, et pas seulement à la
  -- demande, qu'il faut revérifier la course et le bénéficiaire : un marchand
  -- suspendu entre-temps encaissait sans que rien ne le voie.
  PERFORM public.counter_payment_exiger_course_vivante(v_paiement.errand_id);
  PERFORM public.counter_payment_verifier_beneficiaire(v_paiement.merchant_id, v_paiement.errand_id);

  UPDATE public.counter_payments SET etat = 'regle', decide_le = now() WHERE id = p_id;

  INSERT INTO public.errand_payments (errand_id, payer_id, kind, method, amount, reference)
  VALUES (v_paiement.errand_id, v_course.customer_id, 'shopping_advance',
          public.moyen_vers_pay_method(v_marchand.moyen), v_paiement.montant,
          format('comptoir:%s', left(p_id::text, 8)));

  -- Le règlement final lit advance_amount pour savoir ce que le client a déjà
  -- mis. Sans cette ligne, l'argent versé au comptoir n'existait pas pour lui,
  -- et le client repayait son panier une seconde fois.
  PERFORM set_config('app.errand_engine', 'on', true);
  UPDATE public.errands
     SET advance_amount = COALESCE(advance_amount, 0) + v_paiement.montant,
         advance_confirmed_at = COALESCE(advance_confirmed_at, now())
   WHERE id = v_paiement.errand_id;
  PERFORM set_config('app.errand_engine', 'off', true);

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_valider', 'counter_payment', p_id::text,
          jsonb_build_object('montant', v_paiement.montant,
                             'merchant_id', v_paiement.merchant_id,
                             'marchand', v_marchand.nom,
                             'reglement', 'hors ligne, aucun prestataire raccorde'));

  IF v_course.runner_id IS NOT NULL THEN
    PERFORM public.notify_enqueue(
      v_course.runner_id, v_course.id, 'counter_payment_valide',
      'Le client a autorisé le montant',
      format('Le client a autorisé %s FCFA chez %s. Le règlement est pris en charge par Akwaba : n''avancez rien de votre poche. Si le commerçant demande un paiement immédiat, appelez le support.',
             v_montant, v_marchand.nom)
    );
  END IF;

  IF v_marchand.user_id IS NOT NULL THEN
    PERFORM public.notify_enqueue(
      v_marchand.user_id, v_course.id, 'counter_payment_valide_marchand',
      format('Encaissement autorisé : %s FCFA', v_montant),
      format('Le client a validé %s FCFA. Le règlement vous parvient par le canal convenu avec Akwaba, il n''est pas instantané.',
             v_montant)
    );
  END IF;

  RETURN jsonb_build_object('id', p_id, 'etat', 'regle', 'montant', v_paiement.montant);
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_decider(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_decider(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Annuler : seulement ce qui est encore vivant
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_annuler(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_paiement public.counter_payments;
  v_course   public.errands;
BEGIN
  SELECT * INTO v_paiement FROM public.counter_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_course FROM public.errands WHERE id = v_paiement.errand_id;
  IF v_course.customer_id IS DISTINCT FROM v_uid
     AND NOT public.has_permission(v_uid, 'paiements.comptoir.saisir') THEN
    RAISE EXCEPTION 'Seul le client peut annuler son paiement au comptoir.' USING ERRCODE = '42501';
  END IF;

  -- Un paiement validé engage de l'argent : le retirer d'un bouton effacerait
  -- ce que le client doit au marchand. Cette situation relève du litige.
  IF v_paiement.etat = 'regle' THEN
    RAISE EXCEPTION 'Un paiement validé ne s''annule pas : ouvrez un litige.'
      USING ERRCODE = '22023';
  END IF;

  -- Annuler ce qui est déjà refusé ou expiré effacerait la trace de ce qui
  -- s'est réellement passé, et le litige perdrait sa matière.
  IF v_paiement.etat NOT IN ('ouvert', 'a_valider') THEN
    RAISE EXCEPTION 'Ce paiement est % : il n''y a rien à annuler.',
      public.counter_payment_etat_libelle(v_paiement.etat) USING ERRCODE = '22023';
  END IF;

  UPDATE public.counter_payments SET etat = 'annule', decide_le = now() WHERE id = p_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_annuler', 'counter_payment', p_id::text,
          jsonb_build_object('etat_precedent', v_paiement.etat));

  RETURN jsonb_build_object('id', p_id, 'etat', 'annule');
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_annuler(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_annuler(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Une course ne s'annule pas en laissant un paiement en suspens
--
-- Le code resterait présentable au comptoir sur une course qui n'existe plus.
-- Les vérifications ci-dessus le refuseraient, mais le shopper l'aurait déjà
-- présenté, et le commerçant aurait déjà commencé à emballer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_annulation_paiement_en_cours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.status = 'cancelled'::errand_status
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF EXISTS (
      SELECT 1 FROM public.counter_payments
       WHERE errand_id = NEW.id AND etat = 'a_valider'
    ) THEN
      RAISE EXCEPTION 'Un paiement au comptoir attend votre décision : tranchez-le avant d''annuler la course.'
        USING ERRCODE = '22023';
    END IF;

    -- Un code encore ouvert n'engage rien : on le referme plutôt que de
    -- refuser l'annulation pour si peu.
    UPDATE public.counter_payments SET etat = 'annule', decide_le = now()
     WHERE errand_id = NEW.id AND etat = 'ouvert';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_annulation_paiement_en_cours ON public.errands;
CREATE TRIGGER guard_annulation_paiement_en_cours
  BEFORE UPDATE ON public.errands
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_annulation_paiement_en_cours();
