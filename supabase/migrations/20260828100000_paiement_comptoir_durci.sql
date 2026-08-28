-- Durcissement du paiement au comptoir, après une revue adverse.
--
-- Le dispositif tenait sur des promesses que le code ne tenait pas toutes. Six
-- défauts, dont deux qui vidaient la garantie de sa substance.
--
-- 1. Le shopper n'obtenait jamais le code qu'il est censé présenter. Le client
--    l'émettait, le voyait une fois sur son propre écran, et la base n'en
--    gardait qu'une empreinte : personne ne pouvait plus le lire. Le shopper,
--    seul au comptoir, n'avait rien à montrer. Le dispositif entier était donc
--    inutilisable en pratique.
--
-- 2. Un droit déclaré « lire », et marqué non sensible, autorisait à engager
--    l'argent du client. Le libellé disait « Consulter » ; le code s'en servait
--    pour écrire. Qui attribuait ce droit croyait donner une lecture.
--
-- 3. La garde qui empêche le shopper d'être son propre bénéficiaire ne
--    s'armait que si le marchand portait un compte utilisateur. Or la console
--    n'en rattachait jamais : tous les marchands inscrits avaient user_id à
--    NULL, et la garde centrale du dispositif ne se déclenchait pour aucun.
--
-- 4. Le registre des marchands, identifiants de comptes compris, était lisible
--    par n'importe quel utilisateur connecté.
--
-- 5. Le marchand ne pouvait jamais constater qu'il avait été payé : la
--    politique de lecture ne l'incluait pas, et aucun avis ne lui parvenait.
--
-- 6. Les messages annonçaient un paiement effectué. Aucun virement n'est émis :
--    aucun prestataire n'est raccordé. Dire « payé » était faux, et c'est au
--    shopper, qui remet la marchandise sur cette foi, que le mensonge coûtait.

-- ---------------------------------------------------------------------------
-- 1. Le code doit pouvoir revenir à ceux qui en ont besoin
--
-- L'empreinte reste, pour retrouver un paiement à partir du code présenté. On
-- lui adjoint une forme chiffrée, que seuls le client et le shopper de la
-- course peuvent faire déchiffrer, et seulement tant que le code est vivant.
--
-- La clé vit dans le coffre de la base, comme les identifiants Twilio. Un vol
-- de la table ne rend donc rien : il faudrait aussi le coffre.
-- ---------------------------------------------------------------------------

ALTER TABLE public.counter_payments
  ADD COLUMN IF NOT EXISTS code_chiffre bytea;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'counter_payment_key') THEN
    -- La clé est tirée ici et n'apparaît nulle part ailleurs : ni dans ce
    -- fichier, ni dans le dépôt, ni dans un journal.
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'counter_payment_key',
      'Clef de chiffrement des codes de paiement au comptoir'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Un droit d'écrire, nommé comme tel
--
-- « paiements.comptoir.lire » redevient ce que son nom dit. La saisie pour le
-- compte d'un marchand, qui engage l'argent du client, prend son propre droit,
-- déclaré sensible.
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES ('paiements.comptoir.saisir', 'Argent', 'Saisir un encaissement au comptoir',
        'Demander un encaissement pour le compte d''un marchand. Engage l''argent du client, qui devra valider.',
        true, 212)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, sensible = EXCLUDED.sensible,
  position = EXCLUDED.position;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'paiements.comptoir.saisir'),
  ('admin_finance', 'paiements.comptoir.saisir'),
  ('admin_support', 'paiements.comptoir.saisir')
ON CONFLICT DO NOTHING;

-- Le droit de lecture perd sa capacité d'écriture, et le dit.
UPDATE public.permissions
   SET description = 'Consulter les paiements au comptoir et leur état. Ne permet pas d''en saisir.'
 WHERE code = 'paiements.comptoir.lire';

-- ---------------------------------------------------------------------------
-- 3. Émettre : le code est aussi conservé sous forme chiffrée
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_emettre(
  p_errand_id uuid,
  p_plafond   numeric,
  p_minutes   integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
-- pgcrypto peut vivre dans « extensions » ou dans « public » selon l'ordre
-- d'installation. Les deux schémas sont donc dans le chemin, et les appels
-- restent non qualifiés : ils se résolvent où que l'extension se trouve.
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_course  public.errands;
  v_code    text;
  v_id      uuid;
  v_engage  numeric;
  v_deja    numeric;
  v_expire  timestamptz;
BEGIN
  SELECT * INTO v_course FROM public.errands WHERE id = p_errand_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course introuvable.' USING ERRCODE = '22023';
  END IF;

  IF v_course.customer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Seul le client de la course peut ouvrir un paiement au comptoir.'
      USING ERRCODE = '42501';
  END IF;

  IF v_course.status NOT IN ('assigned', 'shopping') THEN
    RAISE EXCEPTION 'Un paiement au comptoir ne s''ouvre qu''une fois le shopper en course.'
      USING ERRCODE = '22023';
  END IF;

  IF p_plafond IS NULL OR p_plafond <= 0 THEN
    RAISE EXCEPTION 'Le plafond doit être un montant positif.' USING ERRCODE = '22023';
  END IF;

  v_engage := GREATEST(
    COALESCE(v_course.basket_total, 0),
    COALESCE(v_course.budget_approved_amount, 0),
    COALESCE(v_course.items_total, 0),
    COALESCE(v_course.budget_estimate, 0)
  );
  IF v_engage <= 0 THEN
    RAISE EXCEPTION 'Cette course n''a pas de budget connu : impossible d''ouvrir un paiement.'
      USING ERRCODE = '22023';
  END IF;
  IF p_plafond > v_engage THEN
    RAISE EXCEPTION 'Le plafond dépasse le budget de la course (% FCFA).', v_engage
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.counter_payments
     WHERE errand_id = p_errand_id AND etat IN ('ouvert', 'a_valider')
  ) THEN
    RAISE EXCEPTION 'Un paiement au comptoir est déjà ouvert sur cette course.'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(sum(COALESCE(montant, plafond)), 0) INTO v_deja
    FROM public.counter_payments
   WHERE errand_id = p_errand_id AND etat = 'regle';

  IF v_deja + p_plafond > v_engage THEN
    RAISE EXCEPTION 'Ce plafond porterait le total au-delà du budget (déjà % FCFA sur % FCFA).',
      v_deja, v_engage USING ERRCODE = '22023';
  END IF;

  -- Seize caractères hexadécimaux : impossibles à deviner, et sans caractère
  -- ambigu quand il faut les lire à voix haute au comptoir.
  v_code := upper(encode(gen_random_bytes(8), 'hex'));
  v_expire := now() + make_interval(mins => GREATEST(COALESCE(p_minutes, 90), 5));

  INSERT INTO public.counter_payments (errand_id, code_hash, code_chiffre, plafond, expire_le, emis_par)
  VALUES (p_errand_id,
          encode(digest(v_code, 'sha256'), 'hex'),
          pgp_sym_encrypt(v_code, public.secret_lire('counter_payment_key')),
          round(p_plafond, 2),
          v_expire,
          v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_emettre', 'counter_payment', v_id::text,
          jsonb_build_object('errand_id', p_errand_id, 'plafond', p_plafond));

  -- Le shopper est prévenu tout de suite : c'est lui qui devra présenter le
  -- code, et il ne peut pas deviner qu'il en existe un.
  IF v_course.runner_id IS NOT NULL THEN
    PERFORM public.notify_enqueue(
      v_course.runner_id, v_course.id, 'counter_payment_ouvert',
      'Un paiement au comptoir vous attend',
      format('Le client autorise jusqu''à %s FCFA chez le marchand. Le code à présenter est dans la course : n''avancez rien de votre poche.',
             to_char(round(p_plafond, 2), 'FM999G999G999'))
    );
  END IF;

  RETURN jsonb_build_object('id', v_id, 'code', v_code,
                            'plafond', round(p_plafond, 2),
                            'expire_le', v_expire);
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_emettre(uuid, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_emettre(uuid, numeric, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. Retrouver le code : le client et le shopper de la course, personne d'autre
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_code(p_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid      uuid := auth.uid();
  v_paiement public.counter_payments;
  v_course   public.errands;
BEGIN
  SELECT * INTO v_paiement FROM public.counter_payments WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Paiement introuvable.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_course FROM public.errands WHERE id = v_paiement.errand_id;

  -- Le shopper en a besoin pour le présenter, le client pour le relire s'il a
  -- fermé son écran. Le personnel, lui, n'en a jamais besoin : connaître le
  -- code permettrait de le présenter soi-même.
  IF v_uid IS DISTINCT FROM v_course.customer_id
     AND v_uid IS DISTINCT FROM v_course.runner_id THEN
    RAISE EXCEPTION 'Ce code ne concerne que le client et le shopper de la course.'
      USING ERRCODE = '42501';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.expire_le < now() THEN
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = p_id;
    RAISE EXCEPTION 'Ce code a expiré.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.code_chiffre IS NULL THEN
    RAISE EXCEPTION 'Ce code a été émis avant la mise en place de la relecture : demandez au client d''en ouvrir un nouveau.'
      USING ERRCODE = '22023';
  END IF;

  -- Chaque relecture laisse une trace : si un code circule, on doit pouvoir
  -- dire qui l'a demandé et quand.
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_code', 'counter_payment', p_id::text,
          jsonb_build_object('role', CASE WHEN v_uid = v_course.runner_id THEN 'shopper' ELSE 'client' END));

  RETURN pgp_sym_decrypt(v_paiement.code_chiffre, public.secret_lire('counter_payment_key'));
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_code(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_code(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Lire un code : le libellé d'état devient lisible
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_etat_libelle(p_etat text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE p_etat
    WHEN 'ouvert'    THEN 'en attente du comptoir'
    WHEN 'a_valider' THEN 'en attente de la validation du client'
    WHEN 'regle'     THEN 'déjà validé'
    WHEN 'refuse'    THEN 'refusé par le client'
    WHEN 'expire'    THEN 'expiré'
    WHEN 'annule'    THEN 'annulé'
    ELSE p_etat
  END;
$fn$;

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

  IF v_paiement.expire_le < now() AND v_paiement.etat IN ('ouvert', 'a_valider') THEN
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = v_paiement.id;
    v_paiement.etat := 'expire';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable : il est %.',
      public.counter_payment_etat_libelle(v_paiement.etat) USING ERRCODE = '22023';
  END IF;

  UPDATE public.counter_payments SET presente_le = COALESCE(presente_le, now())
   WHERE id = v_paiement.id;

  SELECT * INTO v_course FROM public.errands WHERE id = v_paiement.errand_id;

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
-- 6. Demander : la garde anti-capture ne dépend plus d'un rattachement absent
--
-- Comparer les comptes ne suffisait pas : la console n'en rattache aucun. On
-- compare aussi les numéros d'encaissement à ceux que le shopper a déclarés
-- pour se faire payer. Un shopper qui inscrit son propre numéro Wave comme
-- numéro de marchand est ainsi reconnu, même sans compte rattaché.
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
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = v_paiement.id;
    RAISE EXCEPTION 'Ce code a expiré.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable : il est %.',
      public.counter_payment_etat_libelle(v_paiement.etat) USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_marchand FROM public.merchant_accounts WHERE id = p_merchant_id;
  IF NOT FOUND OR NOT v_marchand.actif THEN
    RAISE EXCEPTION 'Ce marchand n''est pas actif.' USING ERRCODE = '22023';
  END IF;
  IF v_marchand.verifie_le IS NULL THEN
    RAISE EXCEPTION 'Ce marchand n''est pas encore vérifié : il ne peut pas encaisser.'
      USING ERRCODE = '42501';
  END IF;

  -- Le demandeur est le marchand lui-même, ou quelqu'un du support habilité à
  -- saisir pour lui. Le shopper, lui, ne peut pas demander : il présente, et
  -- c'est tout.
  IF v_marchand.user_id IS DISTINCT FROM v_uid
     AND NOT public.has_permission(v_uid, 'paiements.comptoir.saisir') THEN
    RAISE EXCEPTION 'Seul le marchand peut demander son encaissement.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_course FROM public.errands WHERE id = v_paiement.errand_id;

  -- La garde qui tient tout le dispositif, par le compte...
  IF v_marchand.user_id IS NOT NULL AND v_marchand.user_id = v_course.runner_id THEN
    RAISE EXCEPTION 'Le shopper de la course ne peut pas en être le bénéficiaire.'
      USING ERRCODE = '42501';
  END IF;
  IF v_marchand.user_id IS NOT NULL AND v_marchand.user_id = v_course.customer_id THEN
    RAISE EXCEPTION 'Le client ne peut pas se payer lui-même.' USING ERRCODE = '42501';
  END IF;

  -- ... et par le numéro, car la console n'impose aucun rattachement de compte.
  -- Sans cette seconde comparaison, un shopper inscrivant son propre numéro
  -- Wave comme marchand passait sans être reconnu.
  IF EXISTS (
    SELECT 1 FROM public.runner_payout_accounts a
     WHERE a.user_id IN (v_course.runner_id, v_course.customer_id)
       AND a.provider = v_marchand.moyen
       AND regexp_replace(a.account_number, '\D', '', 'g')
         = regexp_replace(v_marchand.numero, '\D', '', 'g')
  ) THEN
    RAISE EXCEPTION 'Ce numéro d''encaissement est celui du shopper ou du client de la course.'
      USING ERRCODE = '42501';
  END IF;

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
-- 7. Décider : dire ce qui se passe vraiment, et prévenir le marchand
--
-- Aucun virement n'est émis. Annoncer « payé » au shopper le pousserait à
-- remettre la marchandise sur la foi d'un règlement qui n'a pas eu lieu, et
-- c'est lui qui en répondrait devant le commerçant.
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
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = p_id;
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

  UPDATE public.counter_payments SET etat = 'regle', decide_le = now() WHERE id = p_id;

  -- La trace comptable. « shopping_advance » dit ce que c'est : de l'argent
  -- d'achat, pas une prestation. Le payeur est le client, jamais le shopper,
  -- et c'est cette ligne qui le prouve si quelqu'un le conteste plus tard.
  --
  -- Elle enregistre un dû, pas un virement : rien n'est raccordé à un
  -- prestataire, et le règlement au marchand se fait hors ligne.
  INSERT INTO public.errand_payments (errand_id, payer_id, kind, method, amount, reference)
  VALUES (v_paiement.errand_id, v_course.customer_id, 'shopping_advance',
          v_marchand.moyen::text::public.pay_method, v_paiement.montant,
          format('comptoir:%s', left(p_id::text, 8)));

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
-- 8. Annuler : la lecture ne suffit plus, il faut le droit de saisir
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

  IF v_paiement.etat = 'regle' THEN
    RAISE EXCEPTION 'Un paiement validé ne s''annule pas : ouvrez un litige.' USING ERRCODE = '22023';
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
-- 9. Le registre : inscrire sans détacher, et pouvoir suspendre
--
-- Le numéro ne revient plus dans la réponse : la fonction rendait la ligne
-- entière, ce que l'écran promettait pourtant de ne jamais faire.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean);

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

  INSERT INTO public.merchant_accounts (nom, ville, place_id, user_id, moyen, numero,
                                        verifie_le, verifie_par)
  VALUES (btrim(p_nom), p_ville, p_place_id, p_user_id, p_moyen, btrim(p_numero),
          CASE WHEN p_verifier THEN now() END,
          CASE WHEN p_verifier THEN v_uid END)
  ON CONFLICT (moyen, numero) DO UPDATE SET
    nom = EXCLUDED.nom,
    ville = COALESCE(EXCLUDED.ville, public.merchant_accounts.ville),
    -- Ne pas détacher ce qu'on n'a pas demandé de détacher : la console
    -- n'envoie pas ces deux champs, et les écraser avec NULL couperait le
    -- rattachement d'un marchand au passage d'une simple correction de nom.
    place_id = COALESCE(EXCLUDED.place_id, public.merchant_accounts.place_id),
    user_id = COALESCE(EXCLUDED.user_id, public.merchant_accounts.user_id),
    updated_at = now(),
    verifie_le = COALESCE(EXCLUDED.verifie_le, public.merchant_accounts.verifie_le),
    verifie_par = COALESCE(EXCLUDED.verifie_par, public.merchant_accounts.verifie_par)
  RETURNING * INTO v_marchand;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'merchant_enregistrer', 'merchant_account', v_marchand.id::text,
          jsonb_build_object('nom', v_marchand.nom, 'verifie', v_marchand.verifie_le IS NOT NULL));

  -- Le numéro n'est pas rendu : l'écran l'annonce, et la fonction doit le tenir.
  RETURN jsonb_build_object('id', v_marchand.id, 'nom', v_marchand.nom,
                            'ville', v_marchand.ville, 'moyen', v_marchand.moyen,
                            'actif', v_marchand.actif,
                            'verifie', v_marchand.verifie_le IS NOT NULL);
END;
$fn$;

REVOKE ALL ON FUNCTION public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.merchant_basculer(p_id uuid, p_actif boolean)
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

  UPDATE public.merchant_accounts SET actif = p_actif, updated_at = now()
   WHERE id = p_id RETURNING * INTO v_marchand;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Marchand introuvable.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'merchant_basculer', 'merchant_account', p_id::text,
          jsonb_build_object('actif', p_actif, 'nom', v_marchand.nom));

  RETURN jsonb_build_object('id', p_id, 'actif', v_marchand.actif);
END;
$fn$;

REVOKE ALL ON FUNCTION public.merchant_basculer(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_basculer(uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 10. Qui voit quoi, corrigé
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Marchands verifies lisibles" ON public.merchant_accounts;

-- Le registre n'a aucune raison d'être public. Un client n'a pas à savoir
-- quels commerces encaissent pour Akwaba, ni quels comptes y sont rattachés.
CREATE POLICY "Marchands lisibles par les leurs" ON public.merchant_accounts
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'marchands.gerer')
    OR public.has_permission(auth.uid(), 'paiements.comptoir.lire')
  );

DROP POLICY IF EXISTS "Paiements au comptoir de ma course" ON public.counter_payments;

CREATE POLICY "Paiements au comptoir de ma course" ON public.counter_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.errands e
       WHERE e.id = counter_payments.errand_id
         AND (e.customer_id = auth.uid() OR e.runner_id = auth.uid())
    )
    -- Le marchand doit pouvoir constater qu'il a été payé. Sans cela, il n'a
    -- aucun moyen de rapprocher un encaissement d'une course.
    OR EXISTS (
      SELECT 1 FROM public.merchant_accounts m
       WHERE m.id = counter_payments.merchant_id AND m.user_id = auth.uid()
    )
    OR public.has_permission(auth.uid(), 'paiements.comptoir.lire')
  );

-- La forme chiffrée du code ne se lit pas directement : elle passe par
-- counter_payment_code, qui vérifie qui demande et laisse une trace.
REVOKE ALL ON public.counter_payments FROM anon, authenticated;
GRANT SELECT (id, errand_id, plafond, montant, merchant_id, etat, expire_le,
              emis_par, emis_le, presente_le, demande_le, decide_le, motif, created_at)
  ON public.counter_payments TO authenticated;
