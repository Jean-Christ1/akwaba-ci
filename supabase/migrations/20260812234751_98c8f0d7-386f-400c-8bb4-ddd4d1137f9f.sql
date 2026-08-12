-- ENUMS
CREATE TYPE public.errand_status AS ENUM ('draft','open','assigned','shopping','delivering','delivered','completed','cancelled','disputed');
CREATE TYPE public.errand_category AS ENUM ('grocery','market','pharmacy','restaurant','artisan','admin_paperwork','gas','electronics','other');
CREATE TYPE public.offer_status AS ENUM ('pending','accepted','rejected','withdrawn');
CREATE TYPE public.runner_status AS ENUM ('pending','approved','suspended','rejected');
CREATE TYPE public.pay_method AS ENUM ('cash','wave','orange_money','mtn_momo','moov_money','card');
CREATE TYPE public.pay_status AS ENUM ('pending','held','paid','refunded','failed');

-- RUNNER PROFILES
CREATE TABLE public.runner_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text NOT NULL,
  whatsapp text,
  city text NOT NULL,
  zones jsonb NOT NULL DEFAULT '[]'::jsonb,
  vehicle text NOT NULL DEFAULT 'a_pied',
  bio text,
  id_doc_url text,
  photo_url text,
  status runner_status NOT NULL DEFAULT 'pending',
  is_online boolean NOT NULL DEFAULT false,
  rating numeric NOT NULL DEFAULT 0,
  jobs_completed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.runner_profiles TO authenticated;
GRANT ALL ON public.runner_profiles TO service_role;
ALTER TABLE public.runner_profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_approved_runner(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.runner_profiles WHERE user_id = _uid AND status = 'approved')
$$;

CREATE POLICY "Runner reads own profile" ON public.runner_profiles FOR SELECT TO authenticated
USING (user_id = auth.uid() OR status = 'approved' OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Runner creates own profile" ON public.runner_profiles FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND char_length(full_name) BETWEEN 2 AND 120 AND char_length(phone) BETWEEN 6 AND 30);
CREATE POLICY "Runner updates own profile" ON public.runner_profiles FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));

CREATE TRIGGER trg_runner_profiles_updated BEFORE UPDATE ON public.runner_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ERRANDS
CREATE TABLE public.errands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  runner_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  category errand_category NOT NULL DEFAULT 'grocery',
  city text NOT NULL,
  zone text,
  delivery_address text NOT NULL,
  lat numeric,
  lng numeric,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  budget_estimate numeric NOT NULL DEFAULT 0,
  preferred_contact text NOT NULL DEFAULT 'chat',
  scheduled_for timestamptz,
  status errand_status NOT NULL DEFAULT 'open',
  items_total numeric NOT NULL DEFAULT 0,
  service_fee numeric NOT NULL DEFAULT 0,
  delivery_fee numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0.10,
  commission_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  payment_method pay_method NOT NULL DEFAULT 'cash',
  payment_status pay_status NOT NULL DEFAULT 'pending',
  receipt_url text,
  rating smallint,
  review text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.errands TO authenticated;
GRANT ALL ON public.errands TO service_role;
ALTER TABLE public.errands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Errand visibility" ON public.errands FOR SELECT TO authenticated
USING (
  customer_id = auth.uid()
  OR runner_id = auth.uid()
  OR (status = 'open' AND public.is_approved_runner(auth.uid()))
  OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator')
);
CREATE POLICY "Customer creates errand" ON public.errands FOR INSERT TO authenticated
WITH CHECK (customer_id = auth.uid() AND char_length(title) BETWEEN 3 AND 160 AND char_length(delivery_address) BETWEEN 3 AND 400);
CREATE POLICY "Participants update errand" ON public.errands FOR UPDATE TO authenticated
USING (customer_id = auth.uid() OR runner_id = auth.uid() OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));

CREATE TRIGGER trg_errands_updated BEFORE UPDATE ON public.errands
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_errands_status ON public.errands(status, created_at DESC);
CREATE INDEX idx_errands_customer ON public.errands(customer_id);
CREATE INDEX idx_errands_runner ON public.errands(runner_id);

CREATE OR REPLACE FUNCTION public.is_errand_participant(_errand uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.errands e WHERE e.id = _errand AND (e.customer_id = _uid OR e.runner_id = _uid))
$$;

-- OFFERS
CREATE TABLE public.errand_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  runner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price numeric NOT NULL DEFAULT 0,
  eta_minutes integer NOT NULL DEFAULT 60,
  message text,
  status offer_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (errand_id, runner_id)
);
GRANT SELECT, INSERT, UPDATE ON public.errand_offers TO authenticated;
GRANT ALL ON public.errand_offers TO service_role;
ALTER TABLE public.errand_offers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Offer visibility" ON public.errand_offers FOR SELECT TO authenticated
USING (
  runner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.errands e WHERE e.id = errand_id AND e.customer_id = auth.uid())
  OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator')
);
CREATE POLICY "Approved runner offers" ON public.errand_offers FOR INSERT TO authenticated
WITH CHECK (runner_id = auth.uid() AND public.is_approved_runner(auth.uid()));
CREATE POLICY "Offer update by parties" ON public.errand_offers FOR UPDATE TO authenticated
USING (
  runner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.errands e WHERE e.id = errand_id AND e.customer_id = auth.uid())
  OR has_role(auth.uid(),'admin')
);

-- MESSAGES
CREATE TABLE public.errand_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.errand_messages TO authenticated;
GRANT ALL ON public.errand_messages TO service_role;
ALTER TABLE public.errand_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read messages" ON public.errand_messages FOR SELECT TO authenticated
USING (public.is_errand_participant(errand_id, auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Participants send messages" ON public.errand_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.is_errand_participant(errand_id, auth.uid()) AND char_length(body) BETWEEN 1 AND 2000);
CREATE INDEX idx_errand_messages_errand ON public.errand_messages(errand_id, created_at);

-- EVENTS
CREATE TABLE public.errand_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  errand_id uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status errand_status NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.errand_events TO authenticated;
GRANT ALL ON public.errand_events TO service_role;
ALTER TABLE public.errand_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants read events" ON public.errand_events FOR SELECT TO authenticated
USING (public.is_errand_participant(errand_id, auth.uid()) OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'moderator'));
CREATE POLICY "Participants insert events" ON public.errand_events FOR INSERT TO authenticated
WITH CHECK (actor_id = auth.uid() AND public.is_errand_participant(errand_id, auth.uid()));

-- REALTIME
ALTER TABLE public.errand_messages REPLICA IDENTITY FULL;
ALTER TABLE public.errands REPLICA IDENTITY FULL;
ALTER TABLE public.errand_offers REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.errand_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.errands;
ALTER PUBLICATION supabase_realtime ADD TABLE public.errand_offers;