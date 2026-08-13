
-- ============ ENUMS ============
CREATE TYPE public.fund_mode AS ENUM ('customer_advance','runner_advance','on_delivery');
CREATE TYPE public.dropoff_mode AS ENUM ('runner_delivers','third_party','customer_pickup');
CREATE TYPE public.payout_status AS ENUM ('requested','processing','paid','rejected');
CREATE TYPE public.wallet_entry_kind AS ENUM ('earning','commission','advance_refund','payout','adjustment','bonus');
CREATE TYPE public.errand_payment_kind AS ENUM ('shopping_advance','service_fee','top_up','refund','tip');
CREATE TYPE public.momo_provider AS ENUM ('wave','orange_money','mtn_momo','moov_money','bank');

-- ============ ERRANDS EXTENSIONS ============
ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS fund_mode public.fund_mode NOT NULL DEFAULT 'customer_advance',
  ADD COLUMN IF NOT EXISTS advance_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_proof_url text,
  ADD COLUMN IF NOT EXISTS advance_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_due numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dropoff_mode public.dropoff_mode NOT NULL DEFAULT 'runner_delivers',
  ADD COLUMN IF NOT EXISTS third_party_contact text,
  ADD COLUMN IF NOT EXISTS vehicle_required text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS volume_size text NOT NULL DEFAULT 'small',
  ADD COLUMN IF NOT EXISTS urgency text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS distance_km numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS actual_minutes integer,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS handover_code text,
  ADD COLUMN IF NOT EXISTS runner_payout numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tip_amount numeric NOT NULL DEFAULT 0;

-- ============ PAYOUT ACCOUNTS ============
CREATE TABLE public.runner_payout_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider public.momo_provider NOT NULL DEFAULT 'wave',
  account_number text NOT NULL,
  account_name text NOT NULL,
  is_default boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.runner_payout_accounts TO authenticated;
GRANT ALL ON public.runner_payout_accounts TO service_role;
ALTER TABLE public.runner_payout_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own payout accounts" ON public.runner_payout_accounts FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_payout_accounts_updated BEFORE UPDATE ON public.runner_payout_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WALLETS ============
CREATE TABLE public.runner_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  available_balance numeric NOT NULL DEFAULT 0,
  pending_balance numeric NOT NULL DEFAULT 0,
  lifetime_earnings numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.runner_wallets TO authenticated;
GRANT ALL ON public.runner_wallets TO service_role;
ALTER TABLE public.runner_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own wallet read" ON public.runner_wallets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_wallets_updated BEFORE UPDATE ON public.runner_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ WALLET ENTRIES ============
CREATE TABLE public.wallet_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  errand_id uuid REFERENCES public.errands(id) ON DELETE SET NULL,
  kind public.wallet_entry_kind NOT NULL,
  amount numeric NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.wallet_entries TO authenticated;
GRANT ALL ON public.wallet_entries TO service_role;
ALTER TABLE public.wallet_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own wallet entries" ON public.wallet_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));

-- ============ PAYOUT REQUESTS ============
CREATE TABLE public.payout_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.runner_payout_accounts(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  status public.payout_status NOT NULL DEFAULT 'requested',
  transfer_reference text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.payout_requests TO authenticated;
GRANT ALL ON public.payout_requests TO service_role;
ALTER TABLE public.payout_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own payout requests read" ON public.payout_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own payout requests create" ON public.payout_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND amount > 0);
CREATE POLICY "Admins update payouts" ON public.payout_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_payout_requests_updated BEFORE UPDATE ON public.payout_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ ERRAND PAYMENTS ============
CREATE TABLE public.errand_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL,
  kind public.errand_payment_kind NOT NULL,
  method public.pay_method NOT NULL DEFAULT 'wave',
  amount numeric NOT NULL,
  reference text,
  proof_url text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.errand_payments TO authenticated;
GRANT ALL ON public.errand_payments TO service_role;
ALTER TABLE public.errand_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Participants read payments" ON public.errand_payments FOR SELECT TO authenticated
  USING (public.is_errand_participant(errand_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Participants create payments" ON public.errand_payments FOR INSERT TO authenticated
  WITH CHECK (payer_id = auth.uid() AND public.is_errand_participant(errand_id, auth.uid()) AND amount >= 0);
CREATE POLICY "Participants confirm payments" ON public.errand_payments FOR UPDATE TO authenticated
  USING (public.is_errand_participant(errand_id, auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- ============ REFERRALS ============
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  invited_count integer NOT NULL DEFAULT 0,
  credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own referral read" ON public.referrals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Own referral create" ON public.referrals FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- ============ WALLET AUTO-CREATE ON RUNNER PROFILE ============
CREATE OR REPLACE FUNCTION public.ensure_runner_wallet()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.runner_wallets (user_id) VALUES (NEW.user_id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_runner_wallet AFTER INSERT ON public.runner_profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_runner_wallet();
INSERT INTO public.runner_wallets (user_id)
  SELECT user_id FROM public.runner_profiles ON CONFLICT (user_id) DO NOTHING;
