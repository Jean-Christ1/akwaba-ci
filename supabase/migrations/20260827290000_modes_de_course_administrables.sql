-- Les modes de course deviennent administrables.
--
-- Dix catégories de course existent, écrites dans un type énuméré et dans une
-- constante TypeScript. Ouvrir le marché aux courses de quartier, fermer
-- temporairement les démarches administratives, ou n'autoriser l'avance du
-- client que sur le supermarché : rien de tout cela ne se faisait sans
-- modifier du code, le reconstruire et le redéployer.
--
-- C'est le même défaut que celui du barème tarifaire, au même endroit du
-- produit : une décision d'exploitation qui demandait un développeur.
--
-- Le type énuméré reste : il porte l'intégrité référentielle des courses déjà
-- publiées, et le changer réécrirait leur histoire. Ce qui devient
-- administrable, c'est ce que chaque catégorie autorise, et si elle est
-- ouverte.
--
-- Aucun comportement ne change à l'application de cette migration : les dix
-- catégories sont actives, avec les trois modes de financement, comme
-- aujourd'hui. Fermer une catégorie est une décision, pas une migration.

CREATE TABLE IF NOT EXISTS public.service_modes (
  code        text PRIMARY KEY,
  libelle     text NOT NULL,
  emoji       text NOT NULL DEFAULT '',
  exemple     text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',

  -- Ouverte ou fermée, partout. Une catégorie fermée disparaît du formulaire
  -- et le serveur refuse toute course qui la porterait.
  actif       boolean NOT NULL DEFAULT true,

  -- Les modes de financement autorisés pour cette catégorie. Un retrait de
  -- colis n'a pas d'achat à financer ; un plein de gaz se règle rarement à la
  -- livraison. Le laisser au client sans cadre produit des courses qu'aucun
  -- shopper ne prend.
  modes_financement text[] NOT NULL DEFAULT ARRAY['customer_advance', 'runner_advance', 'on_delivery'],

  -- Certaines catégories engagent assez d'argent pour que la validation du
  -- panier avant paiement soit exigée quel que soit le mode.
  exige_panier_valide boolean NOT NULL DEFAULT false,

  position    integer NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Un mode de financement inconnu ne serait jamais applique : mieux vaut le
  -- refuser a l'ecriture que le decouvrir a la publication d'une course.
  CONSTRAINT service_modes_financement_connu CHECK (
    modes_financement <@ ARRAY['customer_advance', 'runner_advance', 'on_delivery']
    AND array_length(modes_financement, 1) >= 1
  ),
  UNIQUE (position)
);

-- Reprise a l'identique du catalogue actuel, libelles et exemples compris :
-- ils vivaient dans src/modules/errands/domain.ts, ou personne ne pouvait les
-- corriger sans reconstruire l'application.
INSERT INTO public.service_modes (code, libelle, emoji, exemple, description, position) VALUES
  ('grocery', 'Supermarché', '🛒', 'Prosuma, Carrefour, Sococé…',
   'Courses en grande surface. Le panier se compte, le reçu fait foi.', 10),
  ('market', 'Marché', '🧺', 'Adjamé, Cocody, Treichville…',
   'Marché de quartier. Les prix se négocient et varient d''un étal à l''autre.', 20),
  ('pharmacy', 'Pharmacie', '💊', 'Ordonnance, garde de nuit',
   'Médicaments. Une ordonnance peut être exigée par le pharmacien.', 30),
  ('restaurant', 'Restaurant / Maquis', '🍽️', 'Plats à emporter',
   'Plats préparés. Le délai compte plus que le prix.', 40),
  ('artisan', 'Artisan / Service', '🔧', 'Plombier, couturier, coiffure',
   'Intervention d''un artisan. Souvent sans achat à avancer.', 50),
  ('admin_paperwork', 'Démarches', '📄', 'Mairie, CNPS, dépôt de dossier',
   'Démarche administrative. Le temps d''attente fait le prix.', 60),
  ('gas', 'Gaz', '🔥', 'Bouteille, recharge',
   'Bouteille de gaz. Volumineuse, elle demande un véhicule adapté.', 70),
  ('electronics', 'Électronique', '📱', 'Téléphone, accessoires',
   'Achat d''électronique. Montants élevés, vérification à la remise.', 80),
  ('parcel', 'Colis', '📦', 'Retrait, dépôt, remise',
   'Retrait ou dépôt de colis. Aucun achat à financer.', 90),
  ('other', 'Autre', '✳️', 'Décrivez votre besoin',
   'Tout ce qui n''entre pas ailleurs. À décrire précisément.', 100)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle, emoji = EXCLUDED.emoji,
  exemple = EXCLUDED.exemple, description = EXCLUDED.description;

-- Le colis et l'artisan n'ont pas d'achat a financer : proposer une avance sur
-- ces courses n'aurait pas de sens, et le client se demanderait quoi envoyer.
UPDATE public.service_modes
   SET modes_financement = ARRAY['on_delivery']
 WHERE code IN ('parcel', 'artisan');

-- L'electronique engage des montants ou un desaccord coute cher aux deux
-- parties : le panier s'y fait valider avant paiement, quel que soit le mode.
UPDATE public.service_modes SET exige_panier_valide = true WHERE code = 'electronics';

-- ---------------------------------------------------------------------------
-- Ouverture par ville
--
-- Une ville absente de cette table applique le réglage global. C'est le même
-- principe que la modulation tarifaire : oublier d'y inscrire une ville
-- nouvelle ne doit pas fermer son service.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_mode_cities (
  mode_code  text NOT NULL REFERENCES public.service_modes(code) ON DELETE CASCADE,
  city_slug  text NOT NULL REFERENCES public.service_cities(slug) ON DELETE CASCADE,
  actif      boolean NOT NULL DEFAULT true,
  PRIMARY KEY (mode_code, city_slug)
);

-- ---------------------------------------------------------------------------
-- Ce que le formulaire doit proposer
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.service_modes_ouverts(p_ville text DEFAULT NULL)
RETURNS TABLE (
  code text,
  libelle text,
  emoji text,
  exemple text,
  description text,
  modes_financement text[],
  exige_panier_valide boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT m.code, m.libelle, m.emoji, m.exemple, m.description,
         m.modes_financement, m.exige_panier_valide
    FROM public.service_modes m
   WHERE m.actif
     AND (
       p_ville IS NULL
       OR NOT EXISTS (
         -- La course enregistre la ville par son nom, le referentiel par son
         -- identifiant : on accepte les deux, comme partout ailleurs.
         SELECT 1 FROM public.service_mode_cities mc
           JOIN public.service_cities c ON c.slug = mc.city_slug
          WHERE mc.mode_code = m.code
            AND (mc.city_slug = p_ville OR lower(c.name) = lower(p_ville))
            AND NOT mc.actif
       )
     )
   ORDER BY m.position;
$fn$;

-- ---------------------------------------------------------------------------
-- La garde : une course ne se publie pas dans une catégorie fermée
--
-- Le formulaire ne la proposera plus, mais un appel direct le pourrait. Fermer
-- une catégorie doit la fermer, pas seulement la masquer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_errand_mode_ouvert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_mode public.service_modes;
BEGIN
  SELECT * INTO v_mode FROM public.service_modes WHERE code = NEW.category::text;

  -- Une categorie absente de la table est acceptee : elle vient du type
  -- enumere, et fermer par defaut ce qu'on n'a pas encore decrit bloquerait
  -- des courses pour une omission de configuration.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NOT v_mode.actif THEN
    RAISE EXCEPTION 'Les courses « % » ne sont pas ouvertes en ce moment.', v_mode.libelle
      USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_mode_cities mc
      JOIN public.service_cities c ON c.slug = mc.city_slug
     WHERE mc.mode_code = v_mode.code
       AND (mc.city_slug = NEW.city OR lower(c.name) = lower(COALESCE(NEW.city, '')))
       AND NOT mc.actif
  ) THEN
    RAISE EXCEPTION 'Les courses « % » ne sont pas ouvertes à %.', v_mode.libelle, NEW.city
      USING ERRCODE = '22023';
  END IF;

  IF NEW.fund_mode IS NOT NULL
     AND NOT (NEW.fund_mode::text = ANY (v_mode.modes_financement)) THEN
    RAISE EXCEPTION 'Ce mode de règlement n''est pas proposé pour les courses « % ».',
      v_mode.libelle USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_errand_mode_ouvert ON public.errands;
CREATE TRIGGER guard_errand_mode_ouvert
  BEFORE INSERT ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.guard_errand_mode_ouvert();

-- ---------------------------------------------------------------------------
-- Régler depuis la console
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (code, categorie, libelle, description, sensible, position)
VALUES ('services.parametrer', 'Reglages', 'Ouvrir et fermer les services',
        'Activer ou désactiver une catégorie de course, par ville, et choisir ses modes de règlement.',
        false, 235)
ON CONFLICT (code) DO UPDATE SET
  categorie = EXCLUDED.categorie, libelle = EXCLUDED.libelle, description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_code, permission_code) VALUES
  ('super_admin', 'services.parametrer'),
  ('admin_plateforme', 'services.parametrer'),
  ('admin_operations', 'services.parametrer')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.service_mode_regler(
  p_code              text,
  p_actif             boolean,
  p_modes_financement text[] DEFAULT NULL,
  p_exige_panier      boolean DEFAULT NULL,
  p_villes_fermees    text[] DEFAULT NULL
)
RETURNS public.service_modes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid  uuid := auth.uid();
  v_mode public.service_modes;
  v_ville text;
BEGIN
  IF NOT public.has_permission(v_uid, 'services.parametrer') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit d''ouvrir ou fermer un service.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.service_modes SET
    actif = p_actif,
    modes_financement = COALESCE(p_modes_financement, modes_financement),
    exige_panier_valide = COALESCE(p_exige_panier, exige_panier_valide),
    updated_at = now(),
    updated_by = v_uid
  WHERE code = p_code
  RETURNING * INTO v_mode;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service inconnu : %.', p_code USING ERRCODE = '22023';
  END IF;

  -- La liste des villes fermees remplace la precedente : c'est un etat, pas
  -- une suite d'ajouts, et raisonner par ajouts laisserait des fermetures
  -- oubliees que personne ne retrouverait.
  IF p_villes_fermees IS NOT NULL THEN
    DELETE FROM public.service_mode_cities WHERE mode_code = p_code;
    FOREACH v_ville IN ARRAY p_villes_fermees LOOP
      INSERT INTO public.service_mode_cities (mode_code, city_slug, actif)
      VALUES (p_code, v_ville, false)
      ON CONFLICT (mode_code, city_slug) DO UPDATE SET actif = false;
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (actor_id, action, entity, entity_id, details)
  VALUES (v_uid, 'service_mode_regler', 'service_mode', p_code,
          jsonb_build_object('actif', p_actif,
                             'modes_financement', v_mode.modes_financement,
                             'villes_fermees', COALESCE(p_villes_fermees, ARRAY[]::text[])));

  RETURN v_mode;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Qui voit quoi
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_modes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_mode_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_modes       FORCE ROW LEVEL SECURITY;
ALTER TABLE public.service_mode_cities FORCE ROW LEVEL SECURITY;

-- Le catalogue est public : le formulaire de demande le lit avant toute
-- connexion, et savoir qu'une categorie existe ne donne rien a personne.
DROP POLICY IF EXISTS "Services lisibles" ON public.service_modes;
CREATE POLICY "Services lisibles" ON public.service_modes
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Ouverture par ville lisible" ON public.service_mode_cities;
CREATE POLICY "Ouverture par ville lisible" ON public.service_mode_cities
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.service_modes, public.service_mode_cities FROM anon, authenticated;
GRANT SELECT ON public.service_modes, public.service_mode_cities TO anon, authenticated;
GRANT ALL ON public.service_modes, public.service_mode_cities TO service_role;

REVOKE ALL ON FUNCTION public.service_modes_ouverts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_modes_ouverts(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.service_mode_regler(text, boolean, text[], boolean, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.service_mode_regler(text, boolean, text[], boolean, text[]) TO authenticated;
REVOKE ALL ON FUNCTION public.guard_errand_mode_ouvert() FROM PUBLIC;
