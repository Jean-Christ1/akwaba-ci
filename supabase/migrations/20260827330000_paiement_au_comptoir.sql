-- Payer le marchand sans jamais remettre l'argent au shopper.
--
-- Le problème posé est simple à énoncer et difficile à résoudre. Quelqu'un doit
-- payer au comptoir. Si le client avance l'argent au shopper, le shopper peut
-- partir avec. Si le shopper avance le sien, c'est lui qui prend le risque, et
-- un débutant ne peut pas avancer trente mille francs. Les deux solutions
-- exposent quelqu'un, et toujours le plus fragile des deux.
--
-- La troisième voie évite les deux : l'argent ne passe par personne. Le shopper
-- présente un code au comptoir, le marchand saisit le montant exact, et c'est le
-- client qui valide depuis son téléphone. Le paiement va du client au marchand.
-- Le shopper porte les courses, jamais l'argent.
--
-- Ce que le shopper peut faire avec ce code : le montrer. Rien d'autre. Il ne
-- peut ni fixer le montant, ni encaisser, ni le transformer en virement vers
-- lui. Ce que le client peut faire : plafonner, valider, refuser, annuler. Et
-- si rien n'est validé, le code expire et il ne s'est rien passé.
--
-- État du raccordement, dit franchement : aucun prestataire de paiement n'est
-- configuré sur ce compte. Le mécanisme, ses gardes et sa trace existent et
-- sont éprouvés ; l'ordre de virement, lui, attend un compte marchand. Tant
-- qu'il manque, un paiement validé est enregistré comme dû au marchand et
-- réglé hors ligne, exactement comme le sont aujourd'hui les commissions. Rien
-- ici ne prétend qu'un franc a bougé tant qu'un prestataire n'a pas répondu.

-- ---------------------------------------------------------------------------
-- 1. Les marchands que l'on peut payer
--
-- Un marchand doit exister avant de recevoir. Sans registre, n'importe qui
-- pourrait se déclarer bénéficiaire au moment de l'encaissement, et le premier
-- à le faire serait le shopper.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.merchant_accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom         text NOT NULL CHECK (char_length(btrim(nom)) >= 2),
  ville       text,
  -- Quand le marchand a déjà une fiche publique, on la rattache plutôt que de
  -- recopier son nom : deux orthographes du même commerce deviendraient deux
  -- bénéficiaires, et personne ne saurait lequel a été payé.
  place_id    uuid REFERENCES public.places(id) ON DELETE SET NULL,
  -- Le compte du commerçant, quand il en a un. Il lui permet de saisir ses
  -- propres encaissements ; il n'est pas obligatoire.
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  moyen       public.momo_provider NOT NULL,
  numero      text NOT NULL CHECK (char_length(btrim(numero)) >= 6),
  actif       boolean NOT NULL DEFAULT true,
  -- Un marchand non vérifié ne peut pas encaisser. La vérification est le seul
  -- moment où quelqu'un regarde à qui l'argent ira.
  verifie_le  timestamptz,
  verifie_par uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS merchant_accounts_ville ON public.merchant_accounts (ville) WHERE actif;
CREATE UNIQUE INDEX IF NOT EXISTS merchant_accounts_numero_unique
  ON public.merchant_accounts (moyen, numero);

-- ---------------------------------------------------------------------------
-- 2. Le paiement au comptoir
--
-- Le code n'est jamais conservé en clair. Une fuite de la table permettrait
-- sinon de présenter n'importe quel code chez n'importe quel marchand.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.counter_payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id    uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  code_hash    text NOT NULL UNIQUE,
  -- Le plafond est décidé par celui qui paie, et par personne d'autre.
  plafond      numeric(12, 2) NOT NULL CHECK (plafond > 0),
  montant      numeric(12, 2) CHECK (montant IS NULL OR montant > 0),
  merchant_id  uuid REFERENCES public.merchant_accounts(id) ON DELETE RESTRICT,
  etat         text NOT NULL DEFAULT 'ouvert'
                 CHECK (etat IN ('ouvert', 'a_valider', 'regle', 'refuse', 'expire', 'annule')),
  expire_le    timestamptz NOT NULL,
  emis_par     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emis_le      timestamptz NOT NULL DEFAULT now(),
  presente_le  timestamptz,
  demande_le   timestamptz,
  decide_le    timestamptz,
  motif        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS counter_payments_course ON public.counter_payments (errand_id, etat);
CREATE INDEX IF NOT EXISTS counter_payments_a_expirer
  ON public.counter_payments (expire_le) WHERE etat IN ('ouvert', 'a_valider');

-- Un seul code vivant par course, tenu par la base et non par une garde.
-- Deux appels simultanés passeraient tous deux la vérification en plpgsql avant
-- que l'un n'ait écrit : seul un index unique les départage.
CREATE UNIQUE INDEX IF NOT EXISTS counter_payments_un_seul_vivant
  ON public.counter_payments (errand_id) WHERE etat IN ('ouvert', 'a_valider');

COMMENT ON TABLE public.counter_payments IS
  'Paiement au comptoir : le shopper présente, le marchand demande, le client valide. L''argent ne passe jamais par le shopper.';

-- ---------------------------------------------------------------------------
-- 3. Les droits
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES
  ('marchands.gerer', 'Argent', 'Tenir le registre des marchands',
   'Inscrire, vérifier et suspendre un marchand encaisseur.', true, 205),
  ('paiements.comptoir.lire', 'Argent', 'Voir les paiements au comptoir',
   'Consulter les paiements au comptoir et leur état.', false, 210)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, sensible = EXCLUDED.sensible,
  position = EXCLUDED.position;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'marchands.gerer'),
  ('admin_plateforme', 'marchands.gerer'),
  ('admin_finance', 'marchands.gerer'),
  ('super_admin', 'paiements.comptoir.lire'),
  ('admin_plateforme', 'paiements.comptoir.lire'),
  ('admin_finance', 'paiements.comptoir.lire'),
  ('admin_operations', 'paiements.comptoir.lire'),
  ('admin_support', 'paiements.comptoir.lire')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Inscrire et vérifier un marchand
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
RETURNS public.merchant_accounts
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
    nom = EXCLUDED.nom, ville = EXCLUDED.ville, place_id = EXCLUDED.place_id,
    user_id = EXCLUDED.user_id, updated_at = now(),
    verifie_le = COALESCE(EXCLUDED.verifie_le, public.merchant_accounts.verifie_le),
    verifie_par = COALESCE(EXCLUDED.verifie_par, public.merchant_accounts.verifie_par)
  RETURNING * INTO v_marchand;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'merchant_enregistrer', 'merchant_account', v_marchand.id::text,
          jsonb_build_object('nom', v_marchand.nom, 'verifie', v_marchand.verifie_le IS NOT NULL));

  RETURN v_marchand;
END;
$fn$;

REVOKE ALL ON FUNCTION public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_enregistrer(text, public.momo_provider, text, text, uuid, uuid, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Émettre le code : c'est le client, et lui seul
--
-- Le shopper ne peut pas s'émettre un droit de dépense sur l'argent d'un autre.
-- La décision appartient à celui dont c'est l'argent, du début à la fin.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.counter_payment_emettre(
  p_errand_id uuid,
  p_plafond   numeric,
  p_minutes   integer DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_course  public.errands;
  v_code    text;
  v_id      uuid;
  v_engage  numeric;
  v_deja    numeric;
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

  -- Le plafond ne peut pas dépasser ce que le client a engagé pour cette
  -- course. Sans cette borne, une erreur de saisie ouvrirait un droit de
  -- dépense sans rapport avec le panier.
  --
  -- budget_estimate est indispensable ici, et c'était l'oubli. Au moment où le
  -- code s'ouvre, la course est à « assigned » : basket_total est encore vide,
  -- il n'est posé qu'à la soumission du panier ; budget_approved_amount aussi,
  -- il ne sert qu'aux dépassements ; et items_total vaut zéro tant que rien
  -- n'a été acheté. Sans budget_estimate, v_engage valait zéro, les deux gardes
  -- ci-dessous ne s'exécutaient pas, et un client pouvait ouvrir deux codes de
  -- 500 000 FCFA sur une course de 20 000.
  v_engage := GREATEST(
    COALESCE(v_course.basket_total, 0),
    COALESCE(v_course.budget_approved_amount, 0),
    COALESCE(v_course.items_total, 0),
    COALESCE(v_course.budget_estimate, 0)
  );
  IF v_engage <= 0 THEN
    -- Aucun montant connu : on ne sait pas ce qu'on autorise. Refuser vaut
    -- mieux qu'autoriser sans borne.
    RAISE EXCEPTION 'Cette course n''a pas de budget connu : impossible d''ouvrir un paiement.'
      USING ERRCODE = '22023';
  END IF;
  IF p_plafond > v_engage THEN
    RAISE EXCEPTION 'Le plafond dépasse le budget de la course (% FCFA).', v_engage
      USING ERRCODE = '22023';
  END IF;

  -- Un seul code vivant par course, toujours. Cette règle ne dépend pas du
  -- budget : deux codes ouverts en même temps permettraient de payer deux fois
  -- le même panier, quel qu'en soit le montant.
  IF EXISTS (
    SELECT 1 FROM public.counter_payments
     WHERE errand_id = p_errand_id AND etat IN ('ouvert', 'a_valider')
  ) THEN
    RAISE EXCEPTION 'Un paiement au comptoir est déjà ouvert sur cette course.'
      USING ERRCODE = '22023';
  END IF;

  -- Ce qui a déjà été réglé compte aussi : trois paiements successifs de huit
  -- mille sur une course de vingt mille dépasseraient l'engagement du client
  -- sans qu'aucun d'eux ne soit fautif pris isolément.
  SELECT COALESCE(sum(COALESCE(montant, plafond)), 0) INTO v_deja
    FROM public.counter_payments
   WHERE errand_id = p_errand_id AND etat = 'regle';

  IF v_deja + p_plafond > v_engage THEN
    RAISE EXCEPTION 'Ce plafond porterait le total au-delà du budget (déjà % FCFA sur % FCFA).',
      v_deja, v_engage USING ERRCODE = '22023';
  END IF;

  -- Seize caractères hexadécimaux : illisibles à deviner, sans caractère
  -- ambigu quand il faut les lire à voix haute au comptoir.
  v_code := upper(encode(extensions.gen_random_bytes(8), 'hex'));

  INSERT INTO public.counter_payments (errand_id, code_hash, plafond, expire_le, emis_par)
  VALUES (p_errand_id,
          encode(extensions.digest(v_code, 'sha256'), 'hex'),
          round(p_plafond, 2),
          now() + make_interval(mins => GREATEST(COALESCE(p_minutes, 90), 5)),
          v_uid)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_emettre', 'counter_payment', v_id::text,
          jsonb_build_object('errand_id', p_errand_id, 'plafond', p_plafond));

  -- Le code n'est rendu qu'ici, une seule fois. La base n'en garde que
  -- l'empreinte : personne, pas même l'exploitation, ne pourra le relire.
  RETURN jsonb_build_object('id', v_id, 'code', v_code,
                            'plafond', round(p_plafond, 2),
                            'expire_le', now() + make_interval(mins => GREATEST(COALESCE(p_minutes, 90), 5)));
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_emettre(uuid, numeric, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_emettre(uuid, numeric, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Ce que le marchand voit avant de saisir
--
-- Le strict nécessaire pour reconnaître la course, et rien de plus. Un code
-- présenté par erreur ne doit pas révéler l'adresse du client ni son numéro.
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
   WHERE code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce code ne correspond à aucun paiement.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.expire_le < now() AND v_paiement.etat IN ('ouvert', 'a_valider') THEN
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = v_paiement.id;
    v_paiement.etat := 'expire';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable (%).', v_paiement.etat USING ERRCODE = '22023';
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
-- 7. Le marchand demande son montant
--
-- C'est ici que se joue la garde principale : le bénéficiaire ne peut être ni
-- le shopper, ni le client. Sans elle, un shopper inscrit comme marchand
-- encaisserait sa propre course, et tout le dispositif ne servirait à rien.
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
   WHERE code_hash = encode(extensions.digest(upper(btrim(p_code)), 'sha256'), 'hex')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ce code ne correspond à aucun paiement.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.expire_le < now() THEN
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = v_paiement.id;
    RAISE EXCEPTION 'Ce code a expiré.' USING ERRCODE = '22023';
  END IF;

  IF v_paiement.etat <> 'ouvert' THEN
    RAISE EXCEPTION 'Ce code n''est plus utilisable (%).', v_paiement.etat USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_marchand FROM public.merchant_accounts WHERE id = p_merchant_id;
  IF NOT FOUND OR NOT v_marchand.actif THEN
    RAISE EXCEPTION 'Ce marchand n''est pas actif.' USING ERRCODE = '22023';
  END IF;
  IF v_marchand.verifie_le IS NULL THEN
    RAISE EXCEPTION 'Ce marchand n''est pas encore vérifié : il ne peut pas encaisser.'
      USING ERRCODE = '42501';
  END IF;

  -- Le demandeur est le marchand lui-meme, ou quelqu'un du support qui saisit
  -- pour lui. Le shopper, lui, ne peut pas demander : il presente, c'est tout.
  IF v_marchand.user_id IS DISTINCT FROM v_uid
     AND NOT public.has_permission(v_uid, 'paiements.comptoir.lire') THEN
    RAISE EXCEPTION 'Seul le marchand peut demander son encaissement.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_course FROM public.errands WHERE id = v_paiement.errand_id;

  -- La garde qui tient tout le dispositif.
  IF v_marchand.user_id IS NOT NULL AND v_marchand.user_id = v_course.runner_id THEN
    RAISE EXCEPTION 'Le shopper de la course ne peut pas en être le bénéficiaire.'
      USING ERRCODE = '42501';
  END IF;
  IF v_marchand.user_id IS NOT NULL AND v_marchand.user_id = v_course.customer_id THEN
    RAISE EXCEPTION 'Le client ne peut pas se payer lui-même.' USING ERRCODE = '42501';
  END IF;

  IF p_montant IS NULL OR p_montant <= 0 THEN
    RAISE EXCEPTION 'Le montant doit être positif.' USING ERRCODE = '22023';
  END IF;
  IF p_montant > v_paiement.plafond THEN
    RAISE EXCEPTION 'Le montant dépasse le plafond autorisé par le client (% FCFA).',
      v_paiement.plafond USING ERRCODE = '22023';
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

  -- Le client doit décider maintenant, il est au bout du fil et le shopper
  -- attend au comptoir. L'avis part tout de suite.
  PERFORM public.notify_enqueue(
    v_course.customer_id,
    v_course.id,
    'counter_payment_demande',
    format('Paiement à valider : %s FCFA', round(p_montant, 2)),
    format('%s demande %s FCFA pour votre course « %s ». Validez ou refusez depuis l''application.',
           v_marchand.nom, round(p_montant, 2), v_course.title)
  );

  RETURN jsonb_build_object('id', v_paiement.id, 'etat', 'a_valider',
                            'montant', round(p_montant, 2), 'marchand', v_marchand.nom);
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_demander(text, numeric, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_demander(text, numeric, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Le client décide
--
-- Accepter enregistre une dette envers le marchand, pas un virement. Tant
-- qu'aucun prestataire n'est raccordé, dire « paye » serait faux.
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
    RAISE EXCEPTION 'Ce paiement n''attend pas de décision (%).', v_paiement.etat
      USING ERRCODE = '22023';
  END IF;

  IF v_paiement.expire_le < now() THEN
    UPDATE public.counter_payments SET etat = 'expire' WHERE id = p_id;
    RAISE EXCEPTION 'Ce paiement a expiré avant votre décision.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_marchand FROM public.merchant_accounts WHERE id = v_paiement.merchant_id;

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
               v_paiement.montant)
      );
    END IF;

    RETURN jsonb_build_object('id', p_id, 'etat', 'refuse');
  END IF;

  UPDATE public.counter_payments SET etat = 'regle', decide_le = now() WHERE id = p_id;

  -- La trace comptable. « shopping_advance » dit ce que c'est : de l'argent
  -- d'achat, pas une prestation. Le payeur est le client, jamais le shopper,
  -- et c'est cette ligne qui le prouve si quelqu'un le conteste plus tard.
  INSERT INTO public.errand_payments (errand_id, payer_id, kind, method, amount, reference)
  VALUES (v_paiement.errand_id, v_course.customer_id, 'shopping_advance',
          v_marchand.moyen::text::public.pay_method, v_paiement.montant,
          format('comptoir:%s', left(p_id::text, 8)));

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'counter_payment_valider', 'counter_payment', p_id::text,
          jsonb_build_object('montant', v_paiement.montant,
                             'merchant_id', v_paiement.merchant_id,
                             'marchand', v_marchand.nom));

  IF v_course.runner_id IS NOT NULL THEN
    PERFORM public.notify_enqueue(
      v_course.runner_id, v_course.id, 'counter_payment_valide',
      'Paiement validé, vous pouvez prendre les courses',
      format('Le client a validé %s FCFA chez %s. Vous n''avancez rien.',
             v_paiement.montant, v_marchand.nom)
    );
  END IF;

  RETURN jsonb_build_object('id', p_id, 'etat', 'regle', 'montant', v_paiement.montant);
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payment_decider(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.counter_payment_decider(uuid, boolean, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 9. Annuler, et laisser le temps faire le reste
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
     AND NOT public.has_permission(v_uid, 'paiements.comptoir.lire') THEN
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

CREATE OR REPLACE FUNCTION public.counter_payments_expirer()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.counter_payments
     SET etat = 'expire'
   WHERE etat IN ('ouvert', 'a_valider') AND expire_le < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$fn$;

REVOKE ALL ON FUNCTION public.counter_payments_expirer() FROM PUBLIC;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'akwaba-expiration-paiements-comptoir';
SELECT cron.schedule(
  'akwaba-expiration-paiements-comptoir',
  '*/5 * * * *',
  $$SELECT public.counter_payments_expirer()$$
);

-- ---------------------------------------------------------------------------
-- 10. Qui voit quoi
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.merchant_accounts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Marchands verifies lisibles" ON public.merchant_accounts;
CREATE POLICY "Marchands verifies lisibles" ON public.merchant_accounts
  FOR SELECT TO authenticated
  USING (
    (actif AND verifie_le IS NOT NULL)
    OR user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'marchands.gerer')
  );

REVOKE ALL ON public.merchant_accounts FROM anon, authenticated;

-- Le numéro du marchand n'a rien à faire chez le client : il ne lui sert à
-- rien, et le diffuser inviterait à payer hors du dispositif, sans trace.
--
-- La lecture est donc accordée colonne par colonne, et le numéro n'y figure
-- pas. Un GRANT sur la table entière suivi d'un REVOKE sur une colonne ne
-- protège rien : le privilège de table couvre toutes les colonnes, présentes
-- comme futures, et le REVOKE ne l'entame pas.
GRANT SELECT (id, nom, ville, place_id, user_id, moyen, actif,
              verifie_le, verifie_par, created_at, updated_at)
  ON public.merchant_accounts TO authenticated;
GRANT ALL ON public.merchant_accounts TO service_role;

ALTER TABLE public.counter_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Paiements au comptoir de ma course" ON public.counter_payments;
CREATE POLICY "Paiements au comptoir de ma course" ON public.counter_payments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.errands e
       WHERE e.id = counter_payments.errand_id
         AND (e.customer_id = auth.uid() OR e.runner_id = auth.uid())
    )
    OR public.has_permission(auth.uid(), 'paiements.comptoir.lire')
  );

REVOKE ALL ON public.counter_payments FROM anon, authenticated;

-- L'empreinte du code ne se lit pas, même par le client : elle ne lui apprend
-- rien et sa diffusion n'apporterait qu'un risque. Même raison qu'au-dessus
-- pour l'accorder colonne par colonne.
GRANT SELECT (id, errand_id, plafond, montant, merchant_id, etat, expire_le,
              emis_par, emis_le, presente_le, demande_le, decide_le, motif, created_at)
  ON public.counter_payments TO authenticated;
GRANT ALL ON public.counter_payments TO service_role;
