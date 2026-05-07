-- =========================
-- ENUMS
-- =========================
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'partner', 'user');
CREATE TYPE public.place_type AS ENUM ('lodging','restaurant','maquis','attraction','beach','nightlife','culture','shopping');
CREATE TYPE public.place_status AS ENUM ('draft','pending','published','rejected');
CREATE TYPE public.lead_status AS ENUM ('new','in_review','contacted','closed');
CREATE TYPE public.lead_kind AS ENUM ('lodging','restaurant','generic');

-- =========================
-- UPDATED_AT trigger function
-- =========================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- =========================
-- PROFILES
-- =========================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  locale TEXT NOT NULL DEFAULT 'fr',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

-- =========================
-- USER ROLES
-- =========================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Now attach the auth trigger (after user_roles exists)
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================
-- PLACES
-- =========================
CREATE TABLE public.places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type place_type NOT NULL,
  city TEXT NOT NULL,
  zone TEXT,
  address TEXT NOT NULL,
  tagline TEXT,
  description TEXT NOT NULL,
  story TEXT,
  lat NUMERIC(9,6) NOT NULL,
  lng NUMERIC(9,6) NOT NULL,
  standing SMALLINT NOT NULL DEFAULT 3 CHECK (standing BETWEEN 1 AND 5),
  price_band TEXT NOT NULL DEFAULT '€€',
  phone TEXT,
  whatsapp TEXT,
  email TEXT,
  website TEXT,
  image TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  services JSONB NOT NULL DEFAULT '[]'::jsonb,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  cuisines JSONB NOT NULL DEFAULT '[]'::jsonb,
  why_visit JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_for JSONB NOT NULL DEFAULT '[]'::jsonb,
  best_time TEXT,
  average_duration TEXT,
  practical_tips JSONB NOT NULL DEFAULT '[]'::jsonb,
  curator_note TEXT,
  premium BOOLEAN NOT NULL DEFAULT false,
  status place_status NOT NULL DEFAULT 'draft',
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_places_status ON public.places(status);
CREATE INDEX idx_places_owner ON public.places(owner_id);
CREATE INDEX idx_places_city ON public.places(city);
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view published places"
  ON public.places FOR SELECT
  USING (
    status = 'published'
    OR auth.uid() = owner_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'moderator')
  );

CREATE POLICY "Partners can create places"
  ON public.places FOR INSERT
  WITH CHECK (
    auth.uid() = owner_id
    AND (public.has_role(auth.uid(),'partner') OR public.has_role(auth.uid(),'admin'))
  );

CREATE POLICY "Owners and admins can update places"
  ON public.places FOR UPDATE
  USING (
    auth.uid() = owner_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'moderator')
  );

CREATE POLICY "Admins can delete places"
  ON public.places FOR DELETE
  USING (public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_places_updated
  BEFORE UPDATE ON public.places
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- LEADS
-- =========================
CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  place_id UUID REFERENCES public.places(id) ON DELETE SET NULL,
  kind lead_kind NOT NULL DEFAULT 'generic',
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  party_size SMALLINT,
  date_from DATE,
  date_to DATE,
  budget TEXT,
  message TEXT NOT NULL,
  status lead_status NOT NULL DEFAULT 'new',
  partner_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_leads_user ON public.leads(user_id);
CREATE INDEX idx_leads_place ON public.leads(place_id);
CREATE INDEX idx_leads_status ON public.leads(status);
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Anyone (even anonymous) can submit a lead
CREATE POLICY "Anyone can submit a lead"
  ON public.leads FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users see own leads, partners see their place leads, admins see all"
  ON public.leads FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'moderator')
    OR EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = leads.place_id AND p.owner_id = auth.uid()
    )
  );

CREATE POLICY "Partners and admins update leads"
  ON public.leads FOR UPDATE
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'moderator')
    OR EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = leads.place_id AND p.owner_id = auth.uid()
    )
  );

CREATE TRIGGER trg_leads_updated
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- STORAGE: place images
-- =========================
INSERT INTO storage.buckets (id, name, public) VALUES ('place-images','place-images', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Place images are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'place-images');

CREATE POLICY "Authenticated users can upload place images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'place-images'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Owners can update their place images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'place-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Owners can delete their place images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'place-images'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(),'admin')
    )
  );