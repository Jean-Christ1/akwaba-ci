-- ---------------------------------------------------------------------------
-- Le modèle économique cesse d'être inversé.
--
-- Constat de l'audit, vérifié : aucun agrégateur de paiement n'est branché. Le
-- client règle le shopper en direct, sur son compte Wave ou Orange Money. Or à
-- la clôture, la plateforme créditait quand même le portefeuille du shopper du
-- montant net des frais de service, puis réglait ce solde par virement réel
-- depuis la console.
--
-- Le shopper encaissait donc deux fois : une fois du client, une fois de la
-- plateforme. Sur une course à 2 000 F de frais et 300 F de commission,
-- l'éditeur ne gagnait pas 300 F, il perdait 1 700 F. Chaque course terminée
-- était une sortie de trésorerie.
--
-- Le sens de la dette est rétabli : puisque le shopper encaisse la totalité, il
-- DOIT sa commission à la plateforme. Le portefeuille cesse d'être une créance
-- du shopper pour devenir le compte de ce qu'il doit.
--
-- Le mode de règlement est explicite plutôt qu'implicite, pour deux raisons.
-- D'abord parce que le comportement d'avant n'était pas absurde : il est
-- correct le jour où un agrégateur encaisse pour le compte de la plateforme.
-- Ensuite parce qu'un modèle économique inscrit en dur dans une fonction est
-- exactement ce qui a rendu ce défaut invisible pendant si longtemps.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'settlement_mode') THEN
    CREATE TYPE public.settlement_mode AS ENUM ('direct', 'escrow');
  END IF;
END
$$;

COMMENT ON TYPE public.settlement_mode IS
  'direct : le client paie le shopper, qui doit sa commission a la plateforme. escrow : la plateforme encaisse et reverse.';

ALTER TABLE public.commission_rules
  ADD COLUMN IF NOT EXISTS settlement settlement_mode NOT NULL DEFAULT 'direct';

-- Le compte du shopper porte désormais les deux sens : ce qu'il doit, et ce
-- qu'on lui doit. Le second ne sert qu'en mode escrow, mais le conserver évite
-- d'avoir à migrer les soldes le jour où un agrégateur est branché.
ALTER TABLE public.runner_wallets
  ADD COLUMN IF NOT EXISTS commission_due     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_settled numeric(12,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.runner_wallets.commission_due IS
  'Commissions dues a la plateforme et non encore reglees, en mode direct.';

-- Deux natures d'écriture apparaissent au journal : la commission portée au
-- débit du shopper, et son règlement.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'wallet_entry_kind' AND e.enumlabel = 'commission_due'
  ) THEN
    ALTER TYPE public.wallet_entry_kind ADD VALUE 'commission_due';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'wallet_entry_kind' AND e.enumlabel = 'commission_settlement'
  ) THEN
    ALTER TYPE public.wallet_entry_kind ADD VALUE 'commission_settlement';
  END IF;
END
$$;
