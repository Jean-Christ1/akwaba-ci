-- La matrice ouvre enfin ce qu'elle annonce.
--
-- Trouvé par la revue adverse, et mesuré : quinze des trente-cinq droits du
-- catalogue n'étaient consultés nulle part. Ni par une politique, ni par une
-- fonction. Ils s'affichaient « accordé » dans la console et n'ouvraient
-- aucune porte.
--
-- Ce n'est pas seulement inutile, c'est trompeur, et de deux façons opposées.
--
-- On confie « admin_conformite » à un auditeur. La console lui dit qu'il a
-- « audit.lire » et « shoppers.identite.lire », et le panneau de détail lui
-- explique jusqu'où ces droits vont. Il ouvre le journal : rien. Il ouvre une
-- pièce d'identité : refus. Les deux politiques exigeaient toujours le rôle
-- hérité.
--
-- Et symétriquement, la promesse inverse ne tenait pas non plus : la
-- description du rôle financier affirme « aucun accès aux pièces d'identité »,
-- alors que la porte des pièces s'ouvrait au seul rôle hérité, qu'un financier
-- pouvait très bien porter.
--
-- Cette migration branche les droits sensibles sur les portes qu'ils décrivent.
-- Les rôles hérités continuent d'ouvrir, par le chemin normal : le déclencheur
-- les recopie dans la matrice, et l'accès de secours reste dans has_permission.

-- ---------------------------------------------------------------------------
-- Le journal d'audit
--
-- C'est la porte la plus sensible du lot : un journal se lit pour vérifier ce
-- que les autres ont fait.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff read audit" ON public.audit_logs;
CREATE POLICY "Staff read audit" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_permission(auth.uid(), 'audit.lire'));

-- ---------------------------------------------------------------------------
-- Les pièces d'identité
--
-- La description du droit dit qu'il ne permet pas de télécharger la pièce hors
-- de l'application. Encore faut-il qu'il permette de l'ouvrir.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Identity docs read own or moderator" ON storage.objects;
CREATE POLICY "Identity docs read own or moderator" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identity-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.has_permission(auth.uid(), 'shoppers.identite.lire')
    )
  );

DROP POLICY IF EXISTS "Identity docs delete own or admin" ON storage.objects;
CREATE POLICY "Identity docs delete own or admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'identity-docs'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      -- Effacer une piece releve de la conformite, pas de la lecture : c'est
      -- le droit d'exporter qui porte la responsabilite du cycle de vie.
      OR public.has_permission(auth.uid(), 'donnees.exporter')
    )
  );

-- ---------------------------------------------------------------------------
-- Les paiements et les retraits
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Participants read payments" ON public.errand_payments;
CREATE POLICY "Participants read payments" ON public.errand_payments
  FOR SELECT TO authenticated
  USING (
    public.is_errand_participant(errand_id, auth.uid())
    OR public.has_permission(auth.uid(), 'paiements.lire')
  );

DROP POLICY IF EXISTS "Own payout requests read" ON public.payout_requests;
CREATE POLICY "Own payout requests read" ON public.payout_requests
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'paiements.lire')
    OR public.has_permission(auth.uid(), 'retraits.approuver')
  );

-- Un compte de versement porte le numéro sur lequel l'argent part. Le lire
-- relève du même droit que lire les paiements, pas d'un rôle hérité.
DROP POLICY IF EXISTS "Own payout accounts" ON public.runner_payout_accounts;
CREATE POLICY "Own payout accounts" ON public.runner_payout_accounts
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'paiements.lire')
  )
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Les villes et les organisations
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins manage cities" ON public.service_cities;
CREATE POLICY "Admins manage cities" ON public.service_cities
  FOR ALL TO authenticated
  USING (public.has_permission(auth.uid(), 'villes.gerer'))
  WITH CHECK (public.has_permission(auth.uid(), 'villes.gerer'));

DROP POLICY IF EXISTS "Organisation visible aux membres" ON public.organisations;
CREATE POLICY "Organisation visible aux membres" ON public.organisations
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(id, auth.uid())
    OR public.has_permission(auth.uid(), 'organisations.lire')
  );

-- ---------------------------------------------------------------------------
-- Ce que l'audit doit désormais surveiller
--
-- Un droit du catalogue que rien ne consulte s'affiche « accordé » sans rien
-- ouvrir. Le contrôle rend cet écart visible pour qu'il ne grandisse pas en
-- silence, et nomme ceux qui restent, avec la raison.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.droits_jamais_consultes()
RETURNS TABLE (code text, libelle text, sensible boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_source text;
BEGIN
  SELECT COALESCE(string_agg(p.prosrc, ' '), '') INTO v_source
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public';

  SELECT v_source || ' ' || COALESCE(string_agg(
           COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
           COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), ''), ' '), '')
    INTO v_source
    FROM pg_policy pol;

  RETURN QUERY
  SELECT p.code, p.libelle, p.sensible
    FROM public.permissions p
   WHERE position('''' || p.code || '''' in v_source) = 0
   ORDER BY p.sensible DESC, p.position;
END;
$fn$;

REVOKE ALL ON FUNCTION public.droits_jamais_consultes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.droits_jamais_consultes() TO authenticated;

COMMENT ON FUNCTION public.droits_jamais_consultes() IS
  'Les droits du catalogue qu''aucune politique ni fonction ne consulte : ils s''affichent accordes sans rien ouvrir.';
