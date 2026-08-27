-- Les gardes qui rendent le financement tenable.
--
-- Les deux migrations précédentes ont posé les paliers de confiance et la
-- validation du panier. Rien ne s'en servait encore : un plafond que personne
-- n'interroge et un accord que rien n'oppose sont des intentions, pas des
-- protections.
--
-- Quatre gardes ici, une par risque réellement identifié.

-- ---------------------------------------------------------------------------
-- 1. Une avance ne dépasse pas le plafond du shopper
--
-- Le client croyait que le plafond de cinquante mille existait : l'écran le lui
-- disait. Il n'existait nulle part côté serveur. Un shopper validé la veille
-- pouvait recevoir n'importe quel montant, et c'est très exactement ce qu'un
-- réseau de faux comptes vient chercher.
-- ---------------------------------------------------------------------------

-- Le plafond est pose sur la fonction existante par la migration suivante,
-- 20260827230000, et non ici. Une premiere version avait ajoute un parametre,
-- ce qui creait une seconde surcharge : PostgreSQL gardait les deux et tout
-- appel devenait ambigu. L'ecran du client, qui appelle la version a deux
-- parametres, aurait echoue a chaque envoi declare.

-- ---------------------------------------------------------------------------
-- 2. Le shopper ne paie pas un panier que le client n'a pas validé
--
-- C'est la garde qui protège le shopper, donc la partie la plus fragile. En
-- mode « le shopper avance », il engage son propre argent : sans accord
-- préalable, le client peut refuser à l'arrivée, et la marchandise ne se rend
-- pas.
--
-- La facture ne s'enregistre donc qu'après validation du panier, et pour un
-- montant qui ne dépasse pas celui qui a été validé.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_invoice_needs_approved_basket()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Seul le passage a un total d'achats non nul est concerne : le reste des
  -- ecritures du moteur ne doit pas etre gene.
  IF COALESCE(NEW.items_total, 0) <= 0
     OR COALESCE(NEW.items_total, 0) IS NOT DISTINCT FROM COALESCE(OLD.items_total, 0) THEN
    RETURN NEW;
  END IF;

  -- La garde ne vise que le mode ou le shopper avance ses propres fonds.
  -- Ailleurs, l'argent est deja chez lui et le risque a change de camp.
  IF NEW.fund_mode <> 'runner_advance'::fund_mode THEN
    RETURN NEW;
  END IF;

  IF NEW.basket_approved_at IS NULL THEN
    RAISE EXCEPTION
      'Faites valider le panier par le client avant de payer : sans son accord, rien ne vous protège d''un refus à la livraison.'
      USING ERRCODE = '22023';
  END IF;

  -- Payer plus que le montant valide ferait porter la difference au shopper,
  -- ou au client sans son accord. Une tolerance d'un franc absorbe les
  -- arrondis de caisse.
  IF COALESCE(NEW.items_total, 0) > COALESCE(NEW.basket_total, 0) + 1 THEN
    RAISE EXCEPTION
      'La facture (% FCFA) dépasse le panier validé (% FCFA). Soumettez le nouveau panier à validation.',
      trunc(NEW.items_total), trunc(COALESCE(NEW.basket_total, 0))
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_invoice_needs_approved_basket ON public.errands;
CREATE TRIGGER guard_invoice_needs_approved_basket
  BEFORE UPDATE ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_needs_approved_basket();

-- ---------------------------------------------------------------------------
-- 3. Le client n'annule plus après avoir validé le panier
--
-- L'annulation était déjà refusée après l'achat. Elle doit l'être dès la
-- validation : c'est à cet instant que le shopper s'engage, et le laisser
-- s'engager sur un accord révocable ne l'engage à rien.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_cancel_after_basket_approval()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.status = 'cancelled'::errand_status
     AND OLD.status IS DISTINCT FROM 'cancelled'::errand_status
     AND OLD.basket_approved_at IS NOT NULL THEN
    RAISE EXCEPTION
      'Vous avez validé ce panier : le shopper a acheté sur cette base. Ouvrez un litige plutôt qu''une annulation.'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_cancel_after_basket_approval ON public.errands;
CREATE TRIGGER guard_cancel_after_basket_approval
  BEFORE UPDATE ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.guard_cancel_after_basket_approval();

-- ---------------------------------------------------------------------------
-- 4. Ce que le modérateur voit quand il tranche
--
-- Un litige se juge sur des faits datés. La validation du panier en est un, et
-- souvent le plus décisif : elle dit si le client a approuvé ce qu'il conteste.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.errand_financement_resume(p_errand_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
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
    AND (public.has_permission(auth.uid(), 'litiges.lire')
         OR e.customer_id = auth.uid()
         OR e.runner_id = auth.uid());
$fn$;

GRANT EXECUTE ON FUNCTION public.errand_financement_resume(uuid) TO authenticated;
