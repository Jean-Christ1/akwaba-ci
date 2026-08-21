-- Référentiel géographique complet
--
-- Le référentiel ne comptait que douze quartiers d'Abidjan et presque rien
-- ailleurs. Comme le front retombait sur la liste d'Abidjan quand une ville
-- n'avait aucun quartier, un utilisateur de Grand-Bassam se voyait proposer
-- Cocody et Yopougon : le service paraissait ne pas connaître le pays qu'il
-- prétend couvrir.
--
-- Ce référentiel couvre les dix communes d'Abidjan avec leurs quartiers
-- d'usage, puis les quartiers des autres villes desservies. Les noms retenus
-- sont ceux réellement employés localement, pas des découpages administratifs
-- que personne n'utilise pour se situer.

-- ---------------------------------------------------------------------------
-- La commune structure l'adressage à Abidjan : on la distingue du quartier.
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_zones
  ADD COLUMN IF NOT EXISTS parent_name text;

COMMENT ON COLUMN public.service_zones.parent_name IS
  'Commune de rattachement, pour les villes découpées en communes comme Abidjan.';

-- ---------------------------------------------------------------------------
-- Abidjan, par commune
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  -- Cocody
  ('abidjan', 'Cocody Centre',        'Cocody', 10),
  ('abidjan', 'Riviera 2',            'Cocody', 11),
  ('abidjan', 'Riviera 3',            'Cocody', 12),
  ('abidjan', 'Riviera 4',            'Cocody', 13),
  ('abidjan', 'Riviera Palmeraie',    'Cocody', 14),
  ('abidjan', 'Riviera Bonoumin',     'Cocody', 15),
  ('abidjan', 'Angré',                'Cocody', 16),
  ('abidjan', 'Angré 7e Tranche',     'Cocody', 17),
  ('abidjan', 'Deux Plateaux',        'Cocody', 18),
  ('abidjan', 'Deux Plateaux Vallon', 'Cocody', 19),
  ('abidjan', 'Danga',                'Cocody', 20),
  ('abidjan', 'Blockhauss',           'Cocody', 21),
  ('abidjan', 'Mermoz',               'Cocody', 22),
  ('abidjan', 'Attoban',              'Cocody', 23),
  ('abidjan', 'Faya',                 'Cocody', 24),
  ('abidjan', 'Abatta',               'Cocody', 25),

  -- Plateau
  ('abidjan', 'Plateau Centre',       'Plateau', 30),
  ('abidjan', 'Plateau Dokui',        'Plateau', 31),
  ('abidjan', 'Cité Administrative',  'Plateau', 32),

  -- Marcory
  ('abidjan', 'Marcory Résidentiel',  'Marcory', 40),
  ('abidjan', 'Zone 4',               'Marcory', 41),
  ('abidjan', 'Biétry',               'Marcory', 42),
  ('abidjan', 'Remblais',             'Marcory', 43),
  ('abidjan', 'Anoumabo',             'Marcory', 44),
  ('abidjan', 'Konan Raphaël',        'Marcory', 45),

  -- Treichville
  ('abidjan', 'Treichville Centre',   'Treichville', 50),
  ('abidjan', 'Arras',                'Treichville', 51),
  ('abidjan', 'Belleville',           'Treichville', 52),
  ('abidjan', 'Zone 3',               'Treichville', 53),
  ('abidjan', 'Biafra',               'Treichville', 54),

  -- Yopougon
  ('abidjan', 'Yopougon Selmer',      'Yopougon', 60),
  ('abidjan', 'Niangon',              'Yopougon', 61),
  ('abidjan', 'Niangon Sud',          'Yopougon', 62),
  ('abidjan', 'Sideci',               'Yopougon', 63),
  ('abidjan', 'Toits Rouges',         'Yopougon', 64),
  ('abidjan', 'Maroc',                'Yopougon', 65),
  ('abidjan', 'Ananeraie',            'Yopougon', 66),
  ('abidjan', 'Banco',                'Yopougon', 67),
  ('abidjan', 'Andokoi',              'Yopougon', 68),
  ('abidjan', 'Gesco',                'Yopougon', 69),

  -- Abobo
  ('abidjan', 'Abobo Centre',         'Abobo', 80),
  ('abidjan', 'Abobo Baoulé',         'Abobo', 81),
  ('abidjan', 'Anonkoua Kouté',       'Abobo', 82),
  ('abidjan', 'Sagbé',                'Abobo', 83),
  ('abidjan', 'Avocatier',            'Abobo', 84),
  ('abidjan', 'Plaque',               'Abobo', 85),
  ('abidjan', 'Belleville Abobo',     'Abobo', 86),

  -- Adjamé
  ('abidjan', 'Adjamé Centre',        'Adjamé', 100),
  ('abidjan', 'Williamsville',        'Adjamé', 101),
  ('abidjan', 'Bracodi',              'Adjamé', 102),
  ('abidjan', '220 Logements',        'Adjamé', 103),
  ('abidjan', 'Liberté',              'Adjamé', 104),

  -- Koumassi
  ('abidjan', 'Koumassi Centre',      'Koumassi', 110),
  ('abidjan', 'Remblais Koumassi',    'Koumassi', 111),
  ('abidjan', 'Sicogi',               'Koumassi', 112),
  ('abidjan', 'Campement',            'Koumassi', 113),
  ('abidjan', 'Divo',                 'Koumassi', 114),

  -- Port-Bouët
  ('abidjan', 'Port-Bouët Centre',    'Port-Bouët', 120),
  ('abidjan', 'Vridi',                'Port-Bouët', 121),
  ('abidjan', 'Vridi Cité',           'Port-Bouët', 122),
  ('abidjan', 'Gonzagueville',        'Port-Bouët', 123),
  ('abidjan', 'Adjouffou',            'Port-Bouët', 124),
  ('abidjan', 'Anani',                'Port-Bouët', 125),

  -- Attécoubé
  ('abidjan', 'Attécoubé Centre',     'Attécoubé', 130),
  ('abidjan', 'Locodjro',             'Attécoubé', 131),
  ('abidjan', 'Agban Village',        'Attécoubé', 132),
  ('abidjan', 'Santé',                'Attécoubé', 133),

  -- Communes périphériques
  ('abidjan', 'Bingerville Centre',   'Bingerville', 140),
  ('abidjan', 'Adjin',                'Bingerville', 141),
  ('abidjan', 'Songon Centre',        'Songon', 150),
  ('abidjan', 'Anyama Centre',        'Anyama', 160)
ON CONFLICT (city_slug, name) DO UPDATE
  SET parent_name = EXCLUDED.parent_name,
      position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Grand-Bassam
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('grand-bassam', 'Quartier France',   NULL, 10),
  ('grand-bassam', 'Moossou',           NULL, 20),
  ('grand-bassam', 'Petit Paris',       NULL, 30),
  ('grand-bassam', 'Oddos',             NULL, 40),
  ('grand-bassam', 'Impérial',          NULL, 50),
  ('grand-bassam', 'Mockeyville',       NULL, 60),
  ('grand-bassam', 'Azuretti',          NULL, 70),
  ('grand-bassam', 'Vitré',             NULL, 80)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Assinie
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('assinie', 'Assinie-Mafia',    NULL, 10),
  ('assinie', 'Assinie France',   NULL, 20),
  ('assinie', 'Assouindé',        NULL, 30),
  ('assinie', 'Bracodi Plage',    NULL, 40),
  ('assinie', 'Ébra',             NULL, 50)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Yamoussoukro
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('yamoussoukro', 'Centre-ville',     NULL, 10),
  ('yamoussoukro', 'Habitat',          NULL, 20),
  ('yamoussoukro', 'Millionnaire',     NULL, 30),
  ('yamoussoukro', 'Kokrenou',         NULL, 40),
  ('yamoussoukro', 'Morofé',           NULL, 50),
  ('yamoussoukro', 'N''Gokro',         NULL, 60),
  ('yamoussoukro', 'Dioulakro',        NULL, 70),
  ('yamoussoukro', 'Assabou',          NULL, 80),
  ('yamoussoukro', 'Riviera Yamoussoukro', NULL, 90)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Bouaké
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('bouake', 'Commerce',        NULL, 10),
  ('bouake', 'Air France',      NULL, 20),
  ('bouake', 'Koko',            NULL, 30),
  ('bouake', 'Dar Es Salam',    NULL, 40),
  ('bouake', 'Belleville',      NULL, 50),
  ('bouake', 'Nimbo',           NULL, 60),
  ('bouake', 'Ahougnansou',     NULL, 70),
  ('bouake', 'Kennedy',         NULL, 80),
  ('bouake', 'Sokoura',         NULL, 90),
  ('bouake', 'Broukro',         NULL, 100)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- San-Pédro
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('san-pedro', 'Cité',           NULL, 10),
  ('san-pedro', 'Bardot',         NULL, 20),
  ('san-pedro', 'Séweké',         NULL, 30),
  ('san-pedro', 'Balmer',         NULL, 40),
  ('san-pedro', 'Lac',            NULL, 50),
  ('san-pedro', 'Zone Portuaire', NULL, 60),
  ('san-pedro', 'Poro',           NULL, 70)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Korhogo
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('korhogo', 'Centre-ville',   NULL, 10),
  ('korhogo', 'Soba',           NULL, 20),
  ('korhogo', 'Petit Paris',    NULL, 30),
  ('korhogo', 'Koko Korhogo',   NULL, 40),
  ('korhogo', 'Résidentiel',    NULL, 50),
  ('korhogo', 'Banaforo',       NULL, 60),
  ('korhogo', 'Sinistré',       NULL, 70)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Daloa
-- ---------------------------------------------------------------------------

INSERT INTO public.service_zones (city_slug, name, parent_name, position) VALUES
  ('daloa', 'Commerce',      NULL, 10),
  ('daloa', 'Lobia',         NULL, 20),
  ('daloa', 'Tazibouo',      NULL, 30),
  ('daloa', 'Kennedy',       NULL, 40),
  ('daloa', 'Orly',          NULL, 50),
  ('daloa', 'Huberson',      NULL, 60),
  ('daloa', 'Baoulé',        NULL, 70)
ON CONFLICT (city_slug, name) DO UPDATE SET position = EXCLUDED.position;

-- ---------------------------------------------------------------------------
-- Les anciennes entrées d'Abidjan portaient un nom de commune sans quartier.
-- On les conserve comme repères mais on les rattache à leur commune.
-- ---------------------------------------------------------------------------

UPDATE public.service_zones
SET parent_name = name
WHERE city_slug = 'abidjan'
  AND parent_name IS NULL
  AND name IN ('Cocody', 'Plateau', 'Marcory', 'Treichville', 'Yopougon', 'Abobo',
               'Adjamé', 'Koumassi', 'Port-Bouët', 'Bingerville', 'Songon', 'Attécoubé');

CREATE INDEX IF NOT EXISTS idx_service_zones_parent ON public.service_zones (city_slug, parent_name);
