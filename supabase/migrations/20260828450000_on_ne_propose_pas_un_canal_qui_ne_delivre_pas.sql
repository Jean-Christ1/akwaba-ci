-- On ne propose pas un canal sans dire qu'il ne délivre pas.
--
-- L'écran des préférences offre quatre canaux avec la même assurance : « SMS,
-- fonctionne sans connexion internet ». Deux d'entre eux n'ont aucun porteur.
-- Quelqu'un qui choisit le SMS accepte d'être joint, donne son numéro, date son
-- consentement, et ne reçoit plus rien.
--
-- La carte d'exploitation dit désormais ce qui ne part pas, mais elle est
-- réservée au personnel. La personne concernée, elle, n'a aucun moyen de le
-- savoir : elle croit simplement qu'on ne lui écrit pas.
--
-- Cette fonction rend la liste des canaux effectivement portés, sans rien
-- d'autre. Elle n'expose ni compte, ni file, ni destination : uniquement de
-- quoi écrire, à côté d'un choix, qu'il ne fonctionne pas aujourd'hui.

CREATE OR REPLACE FUNCTION public.canaux_portes()
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT ARRAY(
    SELECT c FROM (VALUES ('whatsapp'), ('sms'), ('email'), ('in_app')) AS t(c)
     WHERE CASE c
       WHEN 'whatsapp' THEN
         COALESCE((SELECT j.active FROM cron.job j
                    WHERE j.jobname = 'akwaba-portage-whatsapp'), false)
       -- L'avis interne se lit dans l'application : son porteur est la
       -- politique qui en ouvre la lecture a son destinataire.
       WHEN 'in_app' THEN
         EXISTS (SELECT 1 FROM pg_policy pol
                  WHERE pol.polrelid = 'public.notification_outbox'::regclass
                    AND COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') LIKE '%in_app%')
       ELSE false
     END
     ORDER BY c
  );
$fn$;

REVOKE ALL ON FUNCTION public.canaux_portes() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.canaux_portes() TO authenticated;

COMMENT ON FUNCTION public.canaux_portes() IS
  'Les canaux de notification qui disposent d''un porteur en service. Sert à ne pas proposer un choix qui ne délivrerait rien.';
