-- Codes promotionnels.
--
-- Il n'y en avait aucun : ni table, ni colonne, ni champ de saisie. Une
-- plateforme naissante ne peut pourtant pas se passer d'un levier
-- d'acquisition, et un exploitant qui veut offrir la première course n'avait
-- aucun moyen de le faire sans écrire du code.
--
-- Une décision commande tout le reste : QUI paie la remise.
--
-- La réponse retenue est : la plateforme, sur sa commission, et jamais le
-- shopper. Un shopper n'a pas décidé de la promotion, il ne l'a pas annoncée,
-- il ne l'a même pas vue. Lui faire porter le rabais reviendrait à réduire son
-- revenu pour une décision commerciale qui n'est pas la sienne, et il n'aurait
-- aucun moyen de le savoir : il verrait simplement une course moins bien
-- payée. La remise est donc plafonnée à la commission. Au-delà, elle ne mord
-- pas dans le gain.
--
-- Deuxième règle : la remise ne porte que sur les frais de service. L'argent
-- des achats appartient au marchand ; en offrir une part reviendrait à faire
-- payer un tiers pour la promotion d'Akwaba.

CREATE TABLE IF NOT EXISTS public.promo_codes (
  code            text PRIMARY KEY CHECK (code ~ '^[A-Z0-9-]{3,24}$'),
  libelle         text NOT NULL CHECK (char_length(btrim(libelle)) >= 3),

  -- « percent » : une part des frais de service. « fixed » : un montant.
  type            text NOT NULL CHECK (type IN ('percent', 'fixed')),
  valeur          numeric(12,2) NOT NULL CHECK (valeur > 0),
  -- Plafond de la remise en pourcentage. Sans lui, une longue course offrirait
  -- bien plus qu'une courte pour le même code.
  remise_max      numeric(12,2) CHECK (remise_max IS NULL OR remise_max > 0),

  -- Conditions.
  frais_minimum   numeric(12,2) NOT NULL DEFAULT 0 CHECK (frais_minimum >= 0),
  ville_slug      text REFERENCES public.service_cities(slug) ON DELETE CASCADE,
  debut           timestamptz NOT NULL DEFAULT now(),
  fin             timestamptz,

  -- Un code sans limite d'usage est une promesse ouverte : on peut la faire,
  -- mais il faut la faire exprès.
  usages_max      integer CHECK (usages_max IS NULL OR usages_max > 0),
  usages_par_personne integer NOT NULL DEFAULT 1 CHECK (usages_par_personne > 0),

  actif           boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Un pourcentage au-dela de cent n'a pas de sens, et un code qui finit avant
  -- de commencer ne sera jamais utilisable.
  CONSTRAINT promo_pourcentage_plausible
    CHECK (type <> 'percent' OR valeur <= 100),
  CONSTRAINT promo_periode_coherente
    CHECK (fin IS NULL OR fin > debut)
);

-- Chaque usage est inscrit : sans cela, ni les plafonds ni la comptabilite de
-- ce que la promotion a coute ne sont possibles.
CREATE TABLE IF NOT EXISTS public.promo_redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL REFERENCES public.promo_codes(code) ON DELETE CASCADE,
  errand_id   uuid NOT NULL REFERENCES public.errands(id) ON DELETE CASCADE,
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  remise      numeric(12,2) NOT NULL CHECK (remise >= 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Une course ne consomme un code qu'une fois, meme si son prix est recalcule
  -- a l'acceptation d'une offre.
  UNIQUE (errand_id)
);

CREATE INDEX IF NOT EXISTS promo_redemptions_par_code ON public.promo_redemptions (code);
CREATE INDEX IF NOT EXISTS promo_redemptions_par_personne ON public.promo_redemptions (user_id, code);

ALTER TABLE public.errands
  ADD COLUMN IF NOT EXISTS promo_code     text REFERENCES public.promo_codes(code),
  ADD COLUMN IF NOT EXISTS promo_discount numeric(12,2) NOT NULL DEFAULT 0
    CHECK (promo_discount >= 0);

-- La nouvelle colonne doit etre lisible par le client : il a le droit de voir
-- la remise qui lui a ete appliquee.
SELECT public.refresh_errand_column_grants();

-- ---------------------------------------------------------------------------
-- Le droit de créer un code
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES ('promotions.gerer', 'Finances', 'Gérer les codes promotionnels',
        'Créer, suspendre et consulter les codes promo. Engage la commission de la plateforme.',
        true, 165)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle,
  description = EXCLUDED.description, sensible = EXCLUDED.sensible;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'promotions.gerer'),
  ('admin_finance', 'promotions.gerer'),
  ('admin_plateforme', 'promotions.gerer')
ON CONFLICT DO NOTHING;
