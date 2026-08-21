-- Référentiel des zones de service
--
-- Les villes et les quartiers étaient codés en dur dans le navigateur, et sous
-- deux formes incompatibles : le catalogue de lieux emploie un identifiant en
-- minuscules (abidjan) tandis que les courses stockent le nom affiché
-- (Abidjan). Aucun rapprochement n'était donc possible entre les deux domaines,
-- et ouvrir une nouvelle ville imposait de livrer une version.
--
-- Ce référentiel devient la source unique : il porte les deux formes, les
-- coordonnées qui servent au calcul de distance, et un interrupteur
-- d'activation par ville.

CREATE TABLE IF NOT EXISTS public.service_cities (
  slug        text PRIMARY KEY,
  name        text        NOT NULL,
  region      text,
  lat         numeric(9,6) NOT NULL,
  lng         numeric(9,6) NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  /** Une ville peut être ouverte à la découverte sans l'être aux courses. */
  errands_enabled boolean NOT NULL DEFAULT false,
  position    integer     NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.service_zones (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  city_slug   text        NOT NULL REFERENCES public.service_cities(slug) ON DELETE CASCADE,
  name        text        NOT NULL,
  is_active   boolean     NOT NULL DEFAULT true,
  position    integer     NOT NULL DEFAULT 100,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (city_slug, name)
);

ALTER TABLE public.service_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_zones  ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_service_zones_city ON public.service_zones (city_slug);

-- Le référentiel est public en lecture : il alimente des listes de choix
-- affichées avant toute authentification.
DROP POLICY IF EXISTS "Cities are readable" ON public.service_cities;
CREATE POLICY "Cities are readable"
  ON public.service_cities FOR SELECT TO anon, authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Zones are readable" ON public.service_zones;
CREATE POLICY "Zones are readable"
  ON public.service_zones FOR SELECT TO anon, authenticated
  USING (is_active = true);

-- L'administration du référentiel reste réservée.
DROP POLICY IF EXISTS "Admins manage cities" ON public.service_cities;
CREATE POLICY "Admins manage cities"
  ON public.service_cities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage zones" ON public.service_zones;
CREATE POLICY "Admins manage zones"
  ON public.service_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

REVOKE ALL ON public.service_cities FROM anon;
REVOKE ALL ON public.service_zones  FROM anon;
GRANT SELECT ON public.service_cities TO anon, authenticated;
GRANT SELECT ON public.service_zones  TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_cities TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.service_zones  TO authenticated;
GRANT ALL ON public.service_cities TO service_role;
GRANT ALL ON public.service_zones  TO service_role;

-- ---------------------------------------------------------------------------
-- Villes couvertes
--
-- Les quatre premières portent le catalogue de découverte. Les courses ne sont
-- ouvertes qu'à Abidjan, où le réseau de shoppers existe : annoncer un service
-- là où personne ne peut l'assurer serait une promesse en l'air.
-- ---------------------------------------------------------------------------

INSERT INTO public.service_cities (slug, name, region, lat, lng, errands_enabled, position)
VALUES
  ('abidjan',       'Abidjan',       'Lagunes',        5.336400, -4.026700, true,  10),
  ('grand-bassam',  'Grand-Bassam',  'Sud-Comoé',      5.211800, -3.738700, false, 20),
  ('assinie',       'Assinie',       'Sud-Comoé',      5.133300, -3.283300, false, 30),
  ('yamoussoukro',  'Yamoussoukro',  'Lacs',           6.827600, -5.289300, false, 40),
  ('bouake',        'Bouaké',        'Vallée du Bandama', 7.693900, -5.030300, false, 50),
  ('san-pedro',     'San-Pédro',     'Bas-Sassandra',  4.748500, -6.636300, false, 60),
  ('korhogo',       'Korhogo',       'Savanes',        9.457800, -5.629400, false, 70),
  ('daloa',         'Daloa',         'Haut-Sassandra', 6.877200, -6.450200, false, 80)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  position = EXCLUDED.position;

INSERT INTO public.service_zones (city_slug, name, position)
VALUES
  ('abidjan', 'Cocody',      10),
  ('abidjan', 'Plateau',     20),
  ('abidjan', 'Marcory',     30),
  ('abidjan', 'Treichville', 40),
  ('abidjan', 'Yopougon',    50),
  ('abidjan', 'Abobo',       60),
  ('abidjan', 'Adjamé',      70),
  ('abidjan', 'Koumassi',    80),
  ('abidjan', 'Port-Bouët',  90),
  ('abidjan', 'Bingerville', 100),
  ('abidjan', 'Songon',      110),
  ('abidjan', 'Attécoubé',   120),
  ('grand-bassam', 'Quartier France', 10),
  ('grand-bassam', 'Moossou',         20),
  ('assinie', 'Assinie-Mafia',        10),
  ('yamoussoukro', 'Centre',          10)
ON CONFLICT (city_slug, name) DO NOTHING;
