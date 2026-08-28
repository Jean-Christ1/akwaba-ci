-- Un retrait ne change ni de bénéficiaire, ni de compte, ni de montant.
--
-- Trouvé par l'audit systématique, puis reproduit contre la base : la politique
-- de modification des demandes de retrait porte une clause USING et aucune
-- clause WITH CHECK. La première dit qui peut modifier une ligne ; elle ne dit
-- rien de ce que la ligne devient.
--
-- Conséquence mesurée : un compte portant le rôle hérité « admin » a repris une
-- demande de retrait de 50 000 FCFA appartenant à un shopper, l'a réattribuée à
-- lui-même et l'a portée à 500 000 FCFA, en une seule instruction. Le
-- responsable financier qui approuve ensuite voit une demande cohérente et
-- n'a aucun moyen de savoir qu'elle a été réécrite.
--
-- C'est le trou d'argent le plus direct de l'application : il ne demande ni
-- complice, ni délai, ni connaissance particulière.
--
-- Le correctif est une garde, et non une restriction de droits. Retirer le
-- droit d'écrire romprait la console déployée, qui met à jour le statut, la
-- note et la référence de virement par une écriture directe. Une garde refuse
-- exactement ce qu'il faut refuser et laisse passer le reste : l'écran continue
-- de fonctionner, et la falsification devient impossible.
--
-- Ce que la garde ne prétend pas : elle n'empêche pas une décision légitime
-- mais mauvaise. Approuver un retrait qui ne devrait pas l'être reste possible,
-- et c'est la trace nominative qui répond de cela, pas cette contrainte.

CREATE OR REPLACE FUNCTION public.guard_retrait_immuable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $fn$
BEGIN
  -- Ces trois valeurs disent à qui, où et combien. Elles sont fixées par celui
  -- qui demande le retrait, et personne d'autre n'a de raison d'y toucher : une
  -- demande erronée se refuse et se refait, elle ne se réécrit pas.
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Un retrait ne change pas de bénéficiaire. Refusez cette demande, le shopper en fera une autre.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'Un retrait ne change pas de compte de destination. Refusez cette demande, le shopper en fera une autre.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount THEN
    RAISE EXCEPTION 'Le montant d''un retrait ne se corrige pas après coup. Refusez cette demande, le shopper en fera une autre.'
      USING ERRCODE = '42501';
  END IF;

  -- Un retrait déjà versé est clos. Le rouvrir permettrait de le verser deux
  -- fois, et la seconde fois ne laisserait aucune trace de la première.
  IF OLD.status = 'paid'::payout_status AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Un retrait déjà versé ne se rouvre pas : ouvrez un litige.'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_retrait_immuable ON public.payout_requests;
CREATE TRIGGER guard_retrait_immuable
  BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_retrait_immuable();

COMMENT ON FUNCTION public.guard_retrait_immuable() IS
  'Le bénéficiaire, le compte et le montant d''un retrait ne changent jamais après la demande.';

-- ---------------------------------------------------------------------------
-- La même question, posée à la politique elle-même
--
-- La garde suffit à fermer le trou. La clause WITH CHECK est ajoutée par-dessus
-- parce qu'elle dit la règle là où on la cherche : quelqu'un qui lit la
-- politique doit y voir la limite, sans avoir à deviner qu'un déclencheur la
-- tient ailleurs. Une défense qu'on ne trouve pas en lisant est une défense
-- qu'on supprime par mégarde.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Admins update payouts" ON public.payout_requests;
CREATE POLICY "Admins update payouts" ON public.payout_requests
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'retraits.approuver')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_permission(auth.uid(), 'retraits.approuver')
  );

-- La politique consulte désormais aussi la matrice : un responsable financier
-- à qui l'on confie « retraits.approuver » sans rôle hérité pouvait lire les
-- retraits et pas les traiter, ce qui n'avait aucun sens.
