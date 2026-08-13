-- Données de démarrage du catalogue de lieux.
--
-- FICHIER GÉNÉRÉ : ne pas modifier à la main.
-- Source : src/modules/places/infrastructure/data.ts
-- Régénération : node scripts/generate-place-seed.mjs <fichier>
--
-- Les identifiants sont déterministes, ce qui rend cette insertion rejouable et
-- permet aux parcours et aux favoris de référencer des lieux stables.

-- Les horaires d'ouverture font partie du modèle métier mais n'existaient pas
-- encore en base : le catalogue les portait uniquement côté front.
ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS hours jsonb NOT NULL DEFAULT '{"open": true}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_places_type ON public.places (type);
CREATE INDEX IF NOT EXISTS idx_places_slug ON public.places (slug);

INSERT INTO public.places (
  id, slug, name, type, city, zone, address, tagline, description, story,
  lat, lng, standing, price_band, phone, whatsapp, email, website,
  image, gallery, services, tags, cuisines, why_visit, best_for,
  best_time, average_duration, practical_tips, curator_note, premium, hours, status
) VALUES
  ('11111111-0000-4000-8000-000000000001', 'lodge-cocody-lagune', 'Lodge Cocody Lagune', 'lodging'::place_type, 'abidjan', 'Cocody', 'Rue des Jardins, Cocody, Abidjan', 'Boutique-hôtel discret face à la lagune.', 'Vingt-quatre chambres signées par un architecte abidjanais, piscine à débordement et terrasse en teck. L''adresse choisie par les voyageurs qui veulent un séjour calme à dix minutes du Plateau.', 'Ouvert en 2021 dans une ancienne résidence d''ambassade, le lodge a conservé les manguiers centenaires du jardin et travaille uniquement avec des artisans de Bingerville pour le mobilier.', 5.358, -3.998, 5, '€€€€', '+2252722441234', '+2250707070707', 'reservations@lodgecocody.ci', NULL, '/assets/place-hotel-cocody.jpg', '[]'::jsonb, '["Piscine","Spa","Restaurant","Wi-Fi","Navette aéroport","Parking sécurisé"]'::jsonb, '["Romantique","Business","Calme","Vue lagune"]'::jsonb, '[]'::jsonb, '["Architecture ivoirienne contemporaine et matériaux locaux.","Piscine à débordement orientée coucher de soleil.","Service personnalisé : 24 chambres, équipe stable."]'::jsonb, '["Couples","Voyageurs d''affaires","Premiers séjours premium"]'::jsonb, 'Arrivée en fin d''après-midi pour profiter du sundowner.', '2 à 4 nuits', '["Demander une chambre côté lagune (étages 3 à 5).","Le restaurant accueille aussi les non-résidents sur réservation."]'::jsonb, 'Notre choix pour un premier séjour à Abidjan.', true, '{"open":true,"today":"Réception 24h/24"}'::jsonb, 'published'::place_status),
  ('11111111-0000-4000-8000-000000000002', 'le-comptoir-plateau', 'Le Comptoir du Plateau', 'restaurant'::place_type, 'abidjan', 'Plateau', 'Boulevard de la République, Plateau, Abidjan', 'Cuisine ivoirienne contemporaine, salle feutrée.', 'Le chef revisite les classiques — kedjenou de pintade, sauce graine, attiéké de Dabou — avec une rigueur de fine dining. Carte des vins courte mais juste.', NULL, 5.32, -4.018, 4, '€€€', '+2252720303030', '+2250505050505', NULL, NULL, '/assets/place-restaurant.jpg', '[]'::jsonb, '["Réservation","Climatisation","Carte des vins","Voiturier"]'::jsonb, '["Fine dining","Business","Romantique"]'::jsonb, '["Ivoirienne contemporaine","Française"]'::jsonb, '["Une des rares tables où la cuisine ivoirienne est traitée avec ambition.","Service discret, idéal pour un déjeuner d''affaires.","Cave à vin pensée pour les plats du marché."]'::jsonb, '["Dîner romantique","Déjeuner d''affaires","Découverte culinaire"]'::jsonb, 'Service du soir, demander une table près des baies vitrées.', '1h30 à 2h', '["Réserver 48h à l''avance le week-end.","Tenue smart casual conseillée."]'::jsonb, NULL, true, '{"open":true,"today":"12:00 – 14:30 · 19:30 – 23:00"}'::jsonb, 'published'::place_status),
  ('11111111-0000-4000-8000-000000000003', 'maquis-allocodrome', 'Allocodrome de Zone 4', 'maquis'::place_type, 'abidjan', 'Marcory Zone 4', 'Rue des Jasmins, Zone 4, Marcory', 'L''expérience maquis, version sélection.', 'Poisson braisé, alloco, attiéké et bières fraîches sous les guirlandes. Notre adresse préférée pour comprendre l''esprit Abidjanais sans concession au confort.', NULL, 5.298, -3.998, 3, '€€', '+2250101020203', '+2250101020203', NULL, NULL, '/assets/place-maquis.jpg', '[]'::jsonb, '["Terrasse","Paiement mobile","Live music week-end"]'::jsonb, '["Authentique","Soirée","Groupe"]'::jsonb, '["Ivoirienne","Grillades"]'::jsonb, '["Poisson choisi devant vous, braisé minute.","Ambiance familiale dès 19h, plus festive après 22h.","Prix justes pour la qualité."]'::jsonb, '["Soirée entre amis","Découverte locale","Voyageurs solo"]'::jsonb, 'Vendredi et samedi soir pour la musique live.', '1h30 à 3h', '[]'::jsonb, NULL, false, '{"open":true,"today":"18:00 – 02:00"}'::jsonb, 'published'::place_status),
  ('11111111-0000-4000-8000-000000000004', 'plateau-skyline', 'Skyline du Plateau', 'attraction'::place_type, 'abidjan', 'Plateau', 'Quai d''embarquement Cocody', 'Le Manhattan ouest-africain, vu de la lagune.', 'La meilleure perspective sur les tours du Plateau s''admire depuis la rive de Cocody, ou en pirogue lagunaire au coucher du soleil.', NULL, 5.34, -4.01, 4, '€', NULL, NULL, NULL, NULL, '/assets/place-plateau.jpg', '[]'::jsonb, '["Pirogue lagunaire (sur place)","Photographie autorisée"]'::jsonb, '["Iconique","Photo","Coucher de soleil"]'::jsonb, '[]'::jsonb, '["Vue panoramique unique en Afrique de l''Ouest.","Traversée lagunaire abordable et dépaysante.","Coucher de soleil sur les tours."]'::jsonb, '["Photographes","Premier jour de séjour","Familles"]'::jsonb, '17h30 — 18h30 (lumière dorée).', '1h', '["Négocier le prix de la pirogue avant de monter.","Prévoir une casquette : peu d''ombre sur le quai."]'::jsonb, NULL, false, '{"open":true,"today":"Toute la journée"}'::jsonb, 'published'::place_status),
  ('11111111-0000-4000-8000-000000000005', 'quartier-france-bassam', 'Quartier France', 'culture'::place_type, 'grand-bassam', 'Quartier France', 'Avenue Treich Laplène, Grand-Bassam', 'Le cœur historique classé UNESCO.', 'Façades ocre des années 1890, anciens comptoirs commerciaux, musée du Costume. Une promenade architecturale rare en Afrique de l''Ouest.', 'Première capitale de la Côte d''Ivoire coloniale, abandonnée après l''épidémie de fièvre jaune de 1899. Classé patrimoine mondial UNESCO en 2012.', 5.197, -3.738, 4, '€', NULL, NULL, NULL, NULL, '/assets/place-bassam.jpg', '[]'::jsonb, '["Musée","Galeries d''art","Guide local sur demande"]'::jsonb, '["UNESCO","Histoire","Architecture"]'::jsonb, '[]'::jsonb, '["Patrimoine architectural unique en Afrique de l''Ouest.","Lumière exceptionnelle pour la photographie en fin d''après-midi.","Concentration de galeries et ateliers d''artistes."]'::jsonb, '["Amateurs d''histoire","Familles","Première visite culturelle"]'::jsonb, 'Matinée fraîche ou fin d''après-midi.', '2 à 3h', '["Prendre un guide local au musée (3 000 FCFA, négociable).","Combiner avec un déjeuner les pieds dans le sable."]'::jsonb, NULL, true, '{"open":true,"today":"Promenade libre · Musée 9h–17h"}'::jsonb, 'published'::place_status),
  ('11111111-0000-4000-8000-000000000006', 'lodge-assinie-lagune', 'Assinie Lagune Lodge', 'lodging'::place_type, 'assinie', 'Assinie-Mafia', 'Route d''Assouindé, Assinie', 'Bungalows pieds dans l''eau, entre océan et lagune.', 'Douze bungalows en bois sur la langue de sable d''Assinie. Restaurant en bord de lagune, kayaks, paddle et accès direct à la plage atlantique.', NULL, 5.135, -3.282, 4, '€€€', '+2252721818181', '+2250606060606', NULL, NULL, '/assets/place-assinie.jpg', '[]'::jsonb, '["Plage privée","Kayaks","Restaurant","Wi-Fi","Transferts"]'::jsonb, '["Bord de mer","Romantique","Famille"]'::jsonb, '[]'::jsonb, '["Position rare entre lagune calme et océan vivant.","Bungalows espacés, vraie tranquillité.","Cuisine de mer au quotidien."]'::jsonb, '["Couples","Familles","Week-end depuis Abidjan"]'::jsonb, 'Week-ends de novembre à mai (saison sèche).', '2 nuits idéales', '["Prévoir un transfert privé : la dernière section de route est cabossée.","Réserver le restaurant en haute saison."]'::jsonb, NULL, true, '{"open":true,"today":"Réception 7h – 22h"}'::jsonb, 'published'::place_status),
  ('11111111-0000-4000-8000-000000000007', 'basilique-notre-dame-paix', 'Basilique Notre-Dame de la Paix', 'culture'::place_type, 'yamoussoukro', 'Centre', 'Boulevard Houphouët-Boigny, Yamoussoukro', 'Plus grande basilique du monde.', 'Inspirée de Saint-Pierre de Rome, consacrée par Jean-Paul II en 1990. Coupole de 158 m, 7 000 m² de vitraux, esplanade monumentale.', NULL, 6.8104, -5.2966, 5, '€', NULL, NULL, NULL, NULL, '/assets/place-yamoussoukro.jpg', '[]'::jsonb, '["Visite guidée","Boutique","Parking"]'::jsonb, '["Iconique","Architecture","Spirituel"]'::jsonb, '[]'::jsonb, '["Échelle architecturale unique sur le continent.","Vitraux exceptionnels, en particulier au lever du soleil.","Visite guidée structurée et claire."]'::jsonb, '["Premier voyage","Familles","Photographes"]'::jsonb, 'Matinée pour la lumière sur les vitraux.', '1h30 à 2h', '["Tenue couvrant épaules et genoux exigée.","Combiner avec le palais présidentiel et les caïmans sacrés."]'::jsonb, NULL, true, '{"open":true,"today":"8h – 18h · Visites guidées 9h, 11h, 15h"}'::jsonb, 'published'::place_status)
ON CONFLICT (id) DO UPDATE SET
  slug = EXCLUDED.slug,
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  city = EXCLUDED.city,
  zone = EXCLUDED.zone,
  address = EXCLUDED.address,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  story = EXCLUDED.story,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  standing = EXCLUDED.standing,
  price_band = EXCLUDED.price_band,
  phone = EXCLUDED.phone,
  whatsapp = EXCLUDED.whatsapp,
  email = EXCLUDED.email,
  website = EXCLUDED.website,
  image = EXCLUDED.image,
  gallery = EXCLUDED.gallery,
  services = EXCLUDED.services,
  tags = EXCLUDED.tags,
  cuisines = EXCLUDED.cuisines,
  why_visit = EXCLUDED.why_visit,
  best_for = EXCLUDED.best_for,
  best_time = EXCLUDED.best_time,
  average_duration = EXCLUDED.average_duration,
  practical_tips = EXCLUDED.practical_tips,
  curator_note = EXCLUDED.curator_note,
  premium = EXCLUDED.premium,
  hours = EXCLUDED.hours,
  updated_at = now();
