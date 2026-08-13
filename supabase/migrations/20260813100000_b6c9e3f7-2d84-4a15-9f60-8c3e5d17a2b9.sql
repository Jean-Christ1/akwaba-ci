-- Lot G et J : integrite referentielle, contraintes de montants et confidentialite
--
-- Trois familles de correctifs issus de l'audit :
--   1. Neuf colonnes uuid n'avaient aucune cle etrangere, dont toutes les
--      tables financieres. Aucune integrite, aucune cascade : une suppression
--      de compte laissait des lignes d'argent orphelines.
--   2. Les colonnes monetaires etaient des numeric sans precision ni controle
--      de positivite, et les coordonnees sans precision.
--   3. Le flux des courses ouvertes exposait l'adresse exacte du client a tous
--      les shoppers approuves avant meme la mise en relation.

-- ---------------------------------------------------------------------------
-- 1. Cles etrangeres manquantes
--
-- Les lignes orphelines eventuelles sont d'abord nettoyees, sans quoi la
-- contrainte ne pourrait pas etre posee.
-- ---------------------------------------------------------------------------

DELETE FROM public.runner_wallets w
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = w.user_id);
DELETE FROM public.wallet_entries e
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = e.user_id);
DELETE FROM public.runner_payout_accounts a
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = a.user_id);
DELETE FROM public.payout_requests p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);
DELETE FROM public.referrals r
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = r.user_id);
DELETE FROM public.errand_payments ep
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = ep.payer_id);
DELETE FROM public.place_moderation_events pme
  WHERE pme.place_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.places pl WHERE pl.id = pme.place_id);

DO $$
BEGIN
  -- Portefeuilles et journal : la suppression d'un compte emporte ses lignes.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runner_wallets_user_id_fkey') THEN
    ALTER TABLE public.runner_wallets
      ADD CONSTRAINT runner_wallets_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_entries_user_id_fkey') THEN
    ALTER TABLE public.wallet_entries
      ADD CONSTRAINT wallet_entries_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_entries_errand_id_fkey') THEN
    ALTER TABLE public.wallet_entries
      ADD CONSTRAINT wallet_entries_errand_id_fkey
      FOREIGN KEY (errand_id) REFERENCES public.errands(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runner_payout_accounts_user_id_fkey') THEN
    ALTER TABLE public.runner_payout_accounts
      ADD CONSTRAINT runner_payout_accounts_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_requests_user_id_fkey') THEN
    ALTER TABLE public.payout_requests
      ADD CONSTRAINT payout_requests_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- Un compte de retrait supprime ne doit pas effacer l'historique du versement.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_requests_account_id_fkey') THEN
    ALTER TABLE public.payout_requests
      ADD CONSTRAINT payout_requests_account_id_fkey
      FOREIGN KEY (account_id) REFERENCES public.runner_payout_accounts(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'referrals_user_id_fkey') THEN
    ALTER TABLE public.referrals
      ADD CONSTRAINT referrals_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'errand_payments_payer_id_fkey') THEN
    ALTER TABLE public.errand_payments
      ADD CONSTRAINT errand_payments_payer_id_fkey
      FOREIGN KEY (payer_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  -- La trace de qui a confirme un paiement survit a la suppression du compte.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'errand_payments_confirmed_by_fkey') THEN
    ALTER TABLE public.errand_payments
      ADD CONSTRAINT errand_payments_confirmed_by_fkey
      FOREIGN KEY (confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_moderation_events_place_id_fkey') THEN
    ALTER TABLE public.place_moderation_events
      ADD CONSTRAINT place_moderation_events_place_id_fkey
      FOREIGN KEY (place_id) REFERENCES public.places(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'place_moderation_events_moderator_id_fkey') THEN
    ALTER TABLE public.place_moderation_events
      ADD CONSTRAINT place_moderation_events_moderator_id_fkey
      FOREIGN KEY (moderator_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Precision et positivite des montants
-- ---------------------------------------------------------------------------

-- PostgreSQL refuse de changer le type d'une colonne citée par une politique.
-- Deux politiques d'insertion vérifient des montants : on les retire le temps
-- de la conversion, puis on les rétablit à l'identique juste après. Sans cela,
-- toute la chaîne de migrations bute ici.
DROP POLICY IF EXISTS "Customer creates errand" ON public.errands;
DROP POLICY IF EXISTS "Participants create payments" ON public.errand_payments;

ALTER TABLE public.errands
  ALTER COLUMN budget_estimate  TYPE numeric(12,2),
  ALTER COLUMN items_total      TYPE numeric(12,2),
  ALTER COLUMN service_fee      TYPE numeric(12,2),
  ALTER COLUMN delivery_fee     TYPE numeric(12,2),
  ALTER COLUMN commission_amount TYPE numeric(12,2),
  ALTER COLUMN total_amount     TYPE numeric(12,2),
  ALTER COLUMN runner_payout    TYPE numeric(12,2),
  ALTER COLUMN advance_amount   TYPE numeric(12,2),
  ALTER COLUMN balance_due      TYPE numeric(12,2),
  ALTER COLUMN tip_amount       TYPE numeric(12,2),
  ALTER COLUMN commission_rate  TYPE numeric(5,4),
  ALTER COLUMN lat              TYPE numeric(9,6),
  ALTER COLUMN lng              TYPE numeric(9,6);

ALTER TABLE public.runner_wallets
  ALTER COLUMN available_balance TYPE numeric(12,2),
  ALTER COLUMN pending_balance   TYPE numeric(12,2),
  ALTER COLUMN lifetime_earnings TYPE numeric(12,2);

ALTER TABLE public.wallet_entries  ALTER COLUMN amount TYPE numeric(12,2);
ALTER TABLE public.payout_requests ALTER COLUMN amount TYPE numeric(12,2);
ALTER TABLE public.errand_payments ALTER COLUMN amount TYPE numeric(12,2);
ALTER TABLE public.errand_offers   ALTER COLUMN price  TYPE numeric(12,2);

-- Rétablissement des deux politiques retirées pour la conversion, à
-- l'identique. Une course naît sans aucun montant calculé : c'est le serveur
-- qui les pose ensuite, le client ne peut pas les fixer lui-même.
CREATE POLICY "Customer creates errand"
  ON public.errands FOR INSERT
  TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND char_length(title) >= 3
    AND char_length(title) <= 160
    AND char_length(delivery_address) >= 3
    AND char_length(delivery_address) <= 400
    AND status = ANY (ARRAY['draft'::errand_status, 'open'::errand_status])
    AND payment_status = 'pending'::pay_status
    AND runner_id IS NULL
    AND items_total = 0::numeric
    AND commission_amount = 0::numeric
    AND runner_payout = 0::numeric
    AND tip_amount = 0::numeric
    AND balance_due = 0::numeric
    AND rating IS NULL
    AND budget_estimate >= 0::numeric
    AND service_fee >= 0::numeric
    AND delivery_fee >= 0::numeric
  );

CREATE POLICY "Participants create payments"
  ON public.errand_payments FOR INSERT
  TO authenticated
  WITH CHECK (
    payer_id = auth.uid()
    AND public.is_errand_participant(errand_id, auth.uid())
    AND amount >= 0::numeric
  );

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'errands_amounts_non_negative') THEN
    ALTER TABLE public.errands ADD CONSTRAINT errands_amounts_non_negative CHECK (
      budget_estimate >= 0 AND items_total >= 0 AND service_fee >= 0
      AND delivery_fee >= 0 AND commission_amount >= 0 AND total_amount >= 0
      AND runner_payout >= 0 AND advance_amount >= 0 AND balance_due >= 0
      AND tip_amount >= 0
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'errands_commission_rate_range') THEN
    ALTER TABLE public.errands ADD CONSTRAINT errands_commission_rate_range
      CHECK (commission_rate >= 0 AND commission_rate <= 1);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'errands_rating_range') THEN
    ALTER TABLE public.errands ADD CONSTRAINT errands_rating_range
      CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'errands_distance_positive') THEN
    ALTER TABLE public.errands ADD CONSTRAINT errands_distance_positive
      CHECK (distance_km >= 0 AND estimated_minutes >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallets_balances_non_negative') THEN
    ALTER TABLE public.runner_wallets ADD CONSTRAINT wallets_balances_non_negative
      CHECK (available_balance >= 0 AND pending_balance >= 0 AND lifetime_earnings >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payout_amount_positive') THEN
    ALTER TABLE public.payout_requests ADD CONSTRAINT payout_amount_positive
      CHECK (amount > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runner_profiles_rating_range') THEN
    ALTER TABLE public.runner_profiles ADD CONSTRAINT runner_profiles_rating_range
      CHECK (rating >= 0 AND rating <= 5 AND jobs_completed >= 0);
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Parrainage : les credits ne s'auto-attribuent pas
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Own referral create" ON public.referrals;
CREATE POLICY "Own referral create"
  ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND COALESCE(credits, 0) = 0
    AND COALESCE(invited_count, 0) = 0
  );

-- ---------------------------------------------------------------------------
-- 4. Confidentialite du flux des courses ouvertes
--
-- Un shopper approuve n'a pas besoin de l'adresse exacte du client pour
-- decider s'il se positionne : la ville, la zone et la nature de la course
-- suffisent. L'adresse complete n'est revelee qu'une fois la course assignee,
-- ce que garantit la politique de lecture de errands.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Errand visibility" ON public.errands;
CREATE POLICY "Errand visibility"
  ON public.errands FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR runner_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- Vue du marche ouvert : ce que voit un shopper avant de faire une offre.
CREATE OR REPLACE VIEW public.open_errands_feed AS
  SELECT
    e.id,
    e.title,
    e.category,
    e.city,
    e.zone,
    e.items,
    e.budget_estimate,
    e.service_fee,
    e.runner_payout,
    e.distance_km,
    e.estimated_minutes,
    e.urgency,
    e.volume_size,
    e.vehicle_required,
    e.dropoff_mode,
    e.fund_mode,
    e.scheduled_for,
    e.created_at
  FROM public.errands e
  WHERE e.status = 'open'::errand_status
    AND public.is_approved_runner(auth.uid());

COMMENT ON VIEW public.open_errands_feed IS
  'Courses ouvertes visibles par les shoppers validés. N''expose ni l''adresse exacte, ni les notes, ni l''identité du client.';

GRANT SELECT ON public.open_errands_feed TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Anti-spam sur les demandes publiques
--
-- L'insertion directe par un visiteur anonyme est retiree : les soumissions
-- passent par la fonction edge submit-lead, qui valide et journalise.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can submit a valid lead" ON public.leads;
REVOKE INSERT ON public.leads FROM anon;

CREATE INDEX IF NOT EXISTS idx_errands_city_status ON public.errands (city, status);
CREATE INDEX IF NOT EXISTS idx_errand_offers_runner ON public.errand_offers (runner_id);
