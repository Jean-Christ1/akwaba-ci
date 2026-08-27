-- Aucune fonction privilégiée n'est exécutable par PUBLIC.
--
-- Faille confirmée par sonde : sous le rôle `anon`, donc pour un visiteur non
-- connecté d'Internet, `secret_lire('twilio_api_key_secret')` rendait le secret
-- Twilio en clair. PostgREST expose les fonctions du schéma public en RPC, et
-- `anon` appartient à PUBLIC.
--
-- La cause est un réflexe faux, le mien : `REVOKE ALL ON FUNCTION ... FROM anon,
-- authenticated` ne retire rien, parce que PostgreSQL accorde EXECUTE à PUBLIC
-- par défaut à la création, et que révoquer d'un rôle membre ne retire pas le
-- droit du groupe. Il faut révoquer de PUBLIC.
--
-- Quarante et une fonctions SECURITY DEFINER étaient dans ce cas. La plupart
-- portent leur propre garde et n'auraient rien livré, mais s'appuyer là-dessus
-- est une défense en un seul point. Sept étaient réellement dangereuses :
-- lecture des secrets, envoi de messages sur le compte, vidage de la file,
-- injection de notifications vers un destinataire arbitraire, et suspension en
-- masse des shoppers.
--
-- On ferme donc tout, puis on rouvre nommément ce que l'application appelle.

-- ---------------------------------------------------------------------------
-- 1. Fermer
--
-- Toutes les fonctions SECURITY DEFINER du schéma public perdent l'exécution
-- publique. Les déclencheurs n'en ont jamais eu besoin : ils sont appelés par
-- le moteur, pas par un client.
-- ---------------------------------------------------------------------------

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS signature
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.signature);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Rouvrir, nommément
--
-- Cette liste est celle des fonctions que l'application appelle réellement,
-- relevée dans les sources. Chacune porte sa propre garde : le droit d'exécuter
-- n'est pas le droit de réussir. Une fonction absente d'ici est inatteignable
-- depuis un navigateur, ce qui est l'état voulu par défaut.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_nom text;
  v_sig text;
  -- Appelees depuis l'application, sous l'identite d'une personne connectee.
  v_ouvertes text[] := ARRAY[
    'account_delete_self', 'active_pricing_grid', 'admin_dashboard',
    'commission_rule_publish', 'commission_settlement_record', 'current_commission_rule',
    'dispute_frozen_amounts', 'errand_accept_offer', 'errand_add_tip',
    'errand_advance_status', 'errand_approve_budget_overrun', 'errand_attach_proof',
    'errand_cancel', 'errand_compute_overrun', 'errand_confirm_advance',
    'errand_confirm_payment', 'errand_create', 'errand_decide_basket',
    'errand_declare_advance', 'errand_duplicate', 'errand_financement_resume',
    'errand_handover_code', 'errand_item_decide', 'errand_item_report',
    'errand_open_dispute', 'errand_rate_runner', 'errand_resolve_dispute',
    'errand_runner_payout_account', 'errand_save_invoice', 'errand_schedule_create',
    'errand_schedule_set_active', 'errand_set_organisation',
    'errand_set_substitution_policy', 'errand_submit_basket', 'errand_track_position',
    'errand_unlock_handover', 'has_permission', 'help_article_upsert', 'log_audit',
    'my_permissions', 'notification_preferences_set', 'notification_route',
    'organisation_create', 'organisation_errands', 'organisation_join',
    'organisation_join_code', 'organisation_remove_member',
    'organisation_rotate_join_code', 'payout_request_create', 'payout_request_settle',
    'pricing_publish', 'pricing_quote', 'promo_appliquer', 'promo_evaluer',
    'promo_publier', 'runner_advance_ceiling', 'runner_set_status',
    'runner_submit_identity', 'runner_trust_level', 'staff_assign_role',
    'staff_set_permission', 'taches_planifiees', 'wallet_release_matured_earnings',
    'whatsapp_sante'
  ];
BEGIN
  FOREACH v_nom IN ARRAY v_ouvertes LOOP
    FOR v_sig IN
      SELECT p.oid::regprocedure::text
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = v_nom
    LOOP
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', v_sig);
    END LOOP;
  END LOOP;
END $$;

-- Le barème et le devis se lisent avant toute connexion : la page publique des
-- tarifs les affiche à un visiteur.
GRANT EXECUTE ON FUNCTION public.active_pricing_grid() TO anon;
GRANT EXECUTE ON FUNCTION public.pricing_quote(text, text, text, text, text, numeric, integer, integer)
  TO anon;
GRANT EXECUTE ON FUNCTION public.current_commission_rule() TO anon;

-- ---------------------------------------------------------------------------
-- 3. Ce que le portage appelle, et lui seul
--
-- notify_claim_batch, notify_mark et place_notify sont appelees par les
-- fonctions serveur avec la cle de service. Aucun navigateur n'a a les
-- atteindre : reclamer la file depuis un onglet la viderait.
-- ---------------------------------------------------------------------------

DO $$
DECLARE v_sig text;
BEGIN
  FOR v_sig IN
    SELECT p.oid::regprocedure::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('notify_claim_batch', 'notify_mark', 'place_notify',
                         'errand_schedules_run_due', 'notify_enqueue', 'notify_enqueue_direct',
                         'secret_lire', 'whatsapp_envoyer', 'whatsapp_porter_la_file',
                         'runner_expire_identity_documents')
  LOOP
    -- Retirer aussi de `authenticated` : revoquer de PUBLIC ne defait pas un
    -- GRANT nominatif pose par une migration anterieure, et reclamer la file
    -- depuis un onglet la viderait.
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Le contrôle permanent
--
-- La faille venait d'un réflexe faux, pas d'un oubli : elle reviendra à la
-- prochaine fonction créée si rien ne la guette. Cette fonction dit à tout
-- moment ce qui est ouvert et ne devrait pas l'être.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_execution_publique()
RETURNS TABLE (fonction text, motif text)
LANGUAGE sql
STABLE
AS $fn$
  SELECT p.oid::regprocedure::text,
         CASE WHEN p.proacl IS NULL
              THEN 'aucun ACL : EXECUTE accorde a PUBLIC par defaut'
              ELSE 'EXECUTE explicitement accorde a PUBLIC' END
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef
     AND (p.proacl IS NULL
          OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a
                      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))
   ORDER BY 1;
$fn$;

COMMENT ON FUNCTION public.audit_execution_publique() IS
  'Fonctions SECURITY DEFINER encore executables par PUBLIC. Doit rendre zero ligne.';
