-- La mesure ne se compte pas elle-même.
--
-- `portes_au_role_herite()` cherche les fonctions dont la source contient
-- `has_role(`. Sa propre source en contient un, dans la chaîne qu'elle
-- recherche, et elle se signalait donc elle-même.
--
-- C'est anodin ici, mais pas sans conséquence : l'audit strict aurait échoué en
-- permanence, et une mesure qui crie toujours n'est plus lue. Le premier
-- réflexe serait de la retirer de la chaîne, et le contrôle serait perdu pour
-- de bon.

CREATE OR REPLACE FUNCTION public.portes_au_role_herite()
RETURNS TABLE (genre text, objet text, detail text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT 'politique'::text, cl.relname::text, pol.polname::text
    FROM pg_policy pol
    JOIN pg_class cl ON cl.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = cl.relnamespace
   WHERE n.nspname IN ('public', 'storage')
     AND (COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
          COALESCE(pg_get_expr(pol.polwithcheck, pol.polrelid), '')) LIKE '%has_role(%'
     AND (cl.relname, pol.polname) NOT IN (
       ('user_roles', 'Admins manage roles'),
       ('user_roles', 'Users can view own roles'),
       ('places', 'Admins can delete places'),
       ('places', 'Partners can create places'),
       ('objects', 'Errand proofs delete admin'),
       ('objects', 'Owners can delete their place images')
     )
  UNION ALL
  SELECT 'fonction'::text, p.proname::text, ''::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc LIKE '%has_role(%'
     AND p.proname NOT IN (
       'has_permission', 'has_scoped_permission', 'est_du_personnel',
       -- Celles-ci raisonnent sur l'accès de secours pour le rendre visible :
       -- la réconciliation le compare à la matrice, permissions_effectives le
       -- nomme comme source, mon_perimetre et staff_assign_role s'en servent
       -- pour ne pas enfermer le dernier administrateur hors de la console.
       'permissions_effectives', 'mon_perimetre', 'staff_assign_role',
       'gouvernance_reconciliation', 'gouvernance_sante', 'acces_a_revoir',
       'staff_set_permission', 'sync_legacy_staff_role',
       -- Et la mesure elle-même, qui porte la chaîne qu'elle recherche.
       'portes_au_role_herite'
     )
   ORDER BY 1, 2;
$fn$;
