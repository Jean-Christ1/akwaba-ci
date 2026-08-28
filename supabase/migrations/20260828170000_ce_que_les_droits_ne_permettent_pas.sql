-- Ce que chaque droit ne permet pas.
--
-- Une description dit ce qu'un droit ouvre. Elle ne dit jamais où il s'arrête,
-- et c'est pourtant la question de celui qui l'accorde. « Ouvrir les pièces
-- d'identité » autorise-t-il à les télécharger ? À les transmettre ? La
-- description ne le disait pas, et l'administrateur accordait à l'aveugle.
--
-- Chacun des trente-quatre droits dit désormais aussi ce qu'il ne couvre pas.
-- Écrire cette phrase force à répondre à la question, et la réponse se lit au
-- moment où le droit s'accorde, pas six mois plus tard dans un incident.
--
-- La portée est renseignée dans la foulée : un droit qui n'a de sens que dans
-- une ville peut être restreint à cette ville, les autres valent partout.

UPDATE public.permissions SET ne_permet_pas = v.ne_permet_pas, portee = v.portee
FROM (VALUES
  ('utilisateurs.lire',
   'Ne montre ni les pièces d''identité, ni les coordonnées bancaires, ni le journal d''audit. Ne permet aucune modification.',
   'global'),
  ('utilisateurs.suspendre',
   'Ne supprime pas le compte et n''efface aucune donnée. Une suspension se lève, un effacement non.',
   'global'),
  ('roles.attribuer',
   'Ne permet pas de s''attribuer un droit à soi-même, ni d''accorder un droit qu''on ne détient pas, ni un rôle plus étendu que le sien.',
   'global'),

  ('shoppers.lire',
   'Ne montre pas les pièces d''identité téléversées : elles demandent leur propre droit.',
   'ville'),
  ('shoppers.identite.lire',
   'Ne permet pas de télécharger la pièce hors de l''application, ni de la transmettre. Chaque ouverture est tracée nominativement.',
   'global'),
  ('shoppers.valider',
   'Ne permet pas d''ouvrir les pièces d''identité : on valide sur le dossier constitué, pas sur les documents.',
   'ville'),
  ('shoppers.suspendre',
   'Ne retire pas les gains déjà acquis et n''annule aucune course en cours.',
   'ville'),

  ('courses.lire',
   'Ne montre ni les numéros de téléphone complets, ni les moyens de paiement. Ne permet aucune correction.',
   'ville'),
  ('courses.deverrouiller',
   'Ne change aucun montant et ne modifie pas le statut de paiement : rouvrir une remise n''est pas régler un litige.',
   'ville'),
  ('courses.corriger',
   'Ne permet pas de modifier une course terminée et réglée, ni de changer le shopper affecté.',
   'ville'),

  ('litiges.lire',
   'Ne permet pas de trancher, ni d''écrire aux parties.',
   'ville'),
  ('litiges.trancher',
   'Ne permet pas de déplacer de l''argent directement : la décision produit un mouvement, elle ne le remplace pas.',
   'ville'),

  ('paiements.lire',
   'Ne montre pas les numéros d''encaissement complets et ne permet aucun ordre de virement.',
   'global'),
  ('retraits.approuver',
   'N''émet pas le virement : approuver autorise le versement, un opérateur l''exécute ensuite.',
   'global'),
  ('commissions.encaisser',
   'Ne modifie pas le barème et ne change pas le taux : enregistrer un encaissement n''est pas en fixer le montant.',
   'global'),
  ('bareme.publier',
   'Ne change pas les prix des courses déjà publiées : un barème vaut pour la suite, jamais rétroactivement.',
   'global'),
  ('promotions.gerer',
   'Ne permet pas de réduire le gain du shopper : une remise sort de la commission d''Akwaba, jamais de sa part.',
   'global'),

  ('lieux.lire',
   'Ne montre pas les demandes reçues par un établissement, ni ses coordonnées privées.',
   'ville'),
  ('lieux.moderer',
   'Ne permet pas de modifier le contenu d''une fiche : on l''accepte ou on la refuse avec un motif.',
   'ville'),
  ('aide.gerer',
   'Ne donne accès à aucune donnée de client, de course ou de paiement.',
   'global'),
  ('demandes.traiter',
   'Ne permet pas de réécrire ce que le visiteur a écrit, ni de déplacer sa demande vers un autre établissement.',
   'ville'),
  ('villes.gerer',
   'Ne ferme pas les courses en cours dans une ville qu''on désactive : elles vont à leur terme.',
   'global'),

  ('notifications.parametrer',
   'Ne permet pas d''écrire ni d''envoyer un message : seulement d''en régler la cadence et le volume.',
   'global'),
  ('notifications.envoyer',
   'Ne permet pas de régler la cadence, ni d''écrire à quelqu''un qui a retiré son consentement.',
   'global'),

  ('organisations.lire',
   'Ne montre pas les courses des membres d''une organisation, ni ses factures.',
   'global'),
  ('organisations.gerer',
   'Ne permet pas de facturer une organisation ni de modifier ses conditions financières.',
   'global'),

  ('marchands.gerer',
   'Ne permet pas d''encaisser au nom d''un marchand, ni de relire un numéro d''encaissement déjà saisi.',
   'global'),
  ('paiements.comptoir.lire',
   'Ne permet pas de saisir un encaissement : consulter n''est pas engager l''argent du client.',
   'ville'),
  ('paiements.comptoir.saisir',
   'Ne valide pas le paiement : seul le client autorise. Ne permet pas d''encaisser pour un marchand non vérifié.',
   'global'),
  ('paiements.fournisseurs',
   'Ne donne pas accès aux secrets des prestataires : ils vivent dans le coffre, hors de portée de l''application.',
   'global'),

  ('services.parametrer',
   'N''annule pas les courses déjà publiées dans un service qu''on ferme : elles vont à leur terme.',
   'global'),
  ('exploitation.sante',
   'Ne montre le contenu d''aucun message et ne permet pas d''en renvoyer un.',
   'global'),

  ('audit.lire',
   'Ne permet ni d''effacer, ni de modifier une ligne du journal. Un journal qu''on peut corriger ne prouve rien.',
   'global'),
  ('donnees.exporter',
   'Ne permet pas d''exporter les pièces d''identité ni les secrets. Chaque export est tracé nominativement.',
   'global')
) AS v(code, ne_permet_pas, portee)
WHERE public.permissions.code = v.code;

-- ---------------------------------------------------------------------------
-- Aucun droit ne doit rester muet
--
-- Un droit ajouté demain sans cette phrase se retrouverait accordé à l'aveugle,
-- comme les trente-quatre l'étaient. La garde force à répondre à la question au
-- moment où le droit est créé.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_permission_documentee()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.ne_permet_pas IS NULL OR char_length(btrim(NEW.ne_permet_pas)) < 20 THEN
    RAISE EXCEPTION 'Le droit « % » doit dire ce qu''il ne permet pas. Sans cette phrase, il sera accordé à l''aveugle.',
      NEW.code USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS guard_permission_documentee ON public.permissions;
CREATE TRIGGER guard_permission_documentee
  BEFORE INSERT OR UPDATE ON public.permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_permission_documentee();

-- ---------------------------------------------------------------------------
-- Le catalogue, tel que la console le lit
--
-- Une fonction plutôt qu'une lecture de table : le catalogue est public pour le
-- personnel, mais il dit qui peut quoi, et cela ne regarde pas un visiteur.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.catalogue_des_droits()
RETURNS TABLE (
  code          text,
  categorie     text,
  libelle       text,
  description   text,
  ne_permet_pas text,
  sensible      boolean,
  portee        text,
  -- « position » est un mot reserve dans une declaration de colonne : le
  -- nommer ainsi faisait echouer la migration sur une erreur de syntaxe.
  rang          integer,
  roles         text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_assignments a
     WHERE a.user_id = auth.uid() AND (a.expire_le IS NULL OR a.expire_le > now())
  ) AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Le catalogue des droits est réservé au personnel.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT p.code, p.categorie, p.libelle, p.description, p.ne_permet_pas,
         p.sensible, p.portee, p.position,
         COALESCE(
           (SELECT array_agg(rp.role_code ORDER BY sr.niveau)
              FROM public.role_permissions rp
              JOIN public.staff_roles sr ON sr.code = rp.role_code
             WHERE rp.permission_code = p.code),
           ARRAY[]::text[]
         )
    FROM public.permissions p
   ORDER BY p.position, p.code;
END;
$fn$;

REVOKE ALL ON FUNCTION public.catalogue_des_droits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogue_des_droits() TO authenticated;

CREATE OR REPLACE FUNCTION public.catalogue_des_roles()
RETURNS TABLE (
  code        text,
  libelle     text,
  description text,
  niveau      smallint,
  systeme     boolean,
  droits      integer,
  membres     integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff_assignments a
     WHERE a.user_id = auth.uid() AND (a.expire_le IS NULL OR a.expire_le > now())
  ) AND NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Le catalogue des rôles est réservé au personnel.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT r.code, r.libelle, r.description, r.niveau, r.systeme,
         (SELECT count(*)::integer FROM public.role_permissions rp WHERE rp.role_code = r.code),
         (SELECT count(DISTINCT a.user_id)::integer FROM public.staff_assignments a
           WHERE a.role_code = r.code AND (a.expire_le IS NULL OR a.expire_le > now()))
    FROM public.staff_roles r
   ORDER BY r.niveau, r.code;
END;
$fn$;

REVOKE ALL ON FUNCTION public.catalogue_des_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogue_des_roles() TO authenticated;
