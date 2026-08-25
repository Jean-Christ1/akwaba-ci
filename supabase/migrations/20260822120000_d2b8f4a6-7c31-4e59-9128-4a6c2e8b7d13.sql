-- ---------------------------------------------------------------------------
-- Le droit à l'effacement, exerçable.
--
-- La page de confidentialité promet au visiteur qu'il peut demander l'accès à
-- ses données, leur rectification et leur suppression. Aucun écran ne le
-- permettait, et l'adresse de contact censée recueillir la demande est encore
-- un marqueur à compléter : le droit était annoncé sans aucun moyen de
-- l'exercer.
--
-- Ce que la suppression emporte, vérifié sur les clés étrangères réelles :
--   - en cascade, ce qui est personnel : profil, dossier de shopper, comptes de
--     réception, portefeuille et ses écritures, favoris, rôles, offres,
--     messages, programmations, appartenances aux organisations ;
--   - l'identité seulement, sur ce qui doit survivre : les courses, leurs
--     évènements, leurs paiements, le journal d'audit et la file de
--     notifications gardent leurs montants et leurs dates, l'identifiant de la
--     personne passant à nul.
--
-- La comptabilité des transactions survit donc, la personne disparaît. C'est
-- exactement ce que la page annonce : « sauf ce que la loi nous impose de
-- conserver ».
--
-- Mais un compte dont la situation n'est pas soldée ne peut pas s'effacer sans
-- faire disparaître de l'argent : les écritures du portefeuille partent en
-- cascade. La fonction refuse donc tant qu'il reste une course en cours, une
-- commission due, un solde, ou un retrait en attente, et elle dit lequel.
-- Refuser en l'expliquant vaut mieux qu'effacer une dette.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.account_delete_self()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid        uuid := auth.uid();
  v_courses    integer;
  v_commission numeric(12,2);
  v_solde      numeric(12,2);
  v_retraits   integer;
  v_orgs       text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Vous devez être connecté pour supprimer votre compte.' USING ERRCODE = '42501';
  END IF;

  -- Une course en cours engage l'autre partie : l'effacer la laisserait devant
  -- une commande sans interlocuteur.
  SELECT count(*) INTO v_courses
  FROM public.errands
  WHERE (customer_id = v_uid OR runner_id = v_uid)
    AND status NOT IN ('completed'::errand_status, 'cancelled'::errand_status);

  IF v_courses > 0 THEN
    RAISE EXCEPTION
      'Vous avez % course(s) en cours. Terminez-les ou annulez-les avant de supprimer votre compte.',
      v_courses USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(commission_due, 0),
         COALESCE(available_balance, 0) + COALESCE(pending_balance, 0)
  INTO v_commission, v_solde
  FROM public.runner_wallets WHERE user_id = v_uid;

  IF COALESCE(v_commission, 0) > 0 THEN
    RAISE EXCEPTION
      'Une commission de % reste due à la plateforme. Réglez-la avant de supprimer votre compte.',
      v_commission USING ERRCODE = '22023';
  END IF;

  IF COALESCE(v_solde, 0) > 0 THEN
    RAISE EXCEPTION
      'Votre portefeuille porte encore %. Demandez le retrait avant de supprimer votre compte.',
      v_solde USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_retraits
  FROM public.payout_requests
  WHERE user_id = v_uid
    AND status IN ('requested'::payout_status, 'processing'::payout_status);

  IF v_retraits > 0 THEN
    RAISE EXCEPTION
      'Un retrait est en cours de traitement. Attendez son issue avant de supprimer votre compte.'
      USING ERRCODE = '22023';
  END IF;

  -- Une organisation sans propriétaire ne se gère plus : ni rôle, ni membre, ni
  -- code d'adhésion. La même règle qu'au départ volontaire s'applique.
  SELECT string_agg(o.name, ', ') INTO v_orgs
  FROM public.organisation_members m
  JOIN public.organisations o ON o.id = m.organisation_id
  WHERE m.user_id = v_uid
    AND m.role = 'owner'::org_member_role
    AND (SELECT count(*) FROM public.organisation_members m2
         WHERE m2.organisation_id = m.organisation_id
           AND m2.role = 'owner'::org_member_role) <= 1
    AND (SELECT count(*) FROM public.organisation_members m3
         WHERE m3.organisation_id = m.organisation_id) > 1;

  IF v_orgs IS NOT NULL THEN
    RAISE EXCEPTION
      'Vous êtes le seul propriétaire de : %. Nommez un autre propriétaire avant de supprimer votre compte.',
      v_orgs USING ERRCODE = '22023';
  END IF;

  -- Le geste lui-même. Tout le reste suit les clés étrangères : ce qui est
  -- personnel disparaît, ce qui est comptable garde ses montants sans son nom.
  -- L'effacement se trace, mais sans ce qu'il efface : garder l'identifiant
  -- de la personne dans le journal reviendrait à conserver ce qu'elle demande
  -- de supprimer. Le registre garde le fait et sa date.
  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (NULL, 'delete', 'account', NULL,
          jsonb_build_object('a_l_initiative_de', 'la personne elle-meme'));

  DELETE FROM auth.users WHERE id = v_uid;
END;
$fn$;

COMMENT ON FUNCTION public.account_delete_self() IS
  'Efface le compte de l''appelant. Refuse tant qu''une course, une commission, un solde ou un retrait reste en suspens.';

REVOKE ALL ON FUNCTION public.account_delete_self() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.account_delete_self() TO authenticated;
