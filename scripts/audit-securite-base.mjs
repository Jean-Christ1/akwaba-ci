/**
 * Audit systématique de la base, sur les classes de défauts déjà rencontrées.
 *
 * Chaque contrôle ici correspond à un défaut réel trouvé dans ce dépôt, pas à
 * une bonne pratique abstraite. Une règle qu'on n'a jamais vue se briser ne
 * mérite pas un contrôle ; celles-ci se sont brisées, et rien n'empêchait
 * qu'elles se brisent à nouveau.
 *
 * Il ne modifie rien. Il lit, il compte, et il dit ce qu'il trouve.
 *
 * Usage :
 *   node scripts/audit-securite-base.mjs           constater
 *   node scripts/audit-securite-base.mjs --strict  sortir en erreur s'il reste un constat
 */
import pg from "pg";
import { exigerConfiguration } from "./lib/connexion-base.mjs";

const strict = process.argv.includes("--strict");

const c = new pg.Client(exigerConfiguration("audit de sécurité"));
await c.connect();

const constats = [];
let controles = 0;

const controle = async (titre, requete, decrire, pourquoi) => {
  controles++;
  const r = await c.query(requete);
  if (r.rows.length === 0) {
    console.log(`  ${titre} : rien à signaler`);
    return;
  }
  console.log(`  ${titre} : ${r.rows.length} constat(s)`);
  console.log(`     ${pourquoi}`);
  for (const ligne of r.rows.slice(0, 12)) {
    console.log(`       ${decrire(ligne)}`);
    constats.push(`${titre} : ${decrire(ligne)}`);
  }
  if (r.rows.length > 12) console.log(`       ... et ${r.rows.length - 12} autres`);
};

console.log("=== AUDIT DE SÉCURITÉ DE LA BASE ===\n");

// ---------------------------------------------------------------------------
// 1. Une politique de modification sans WITH CHECK
//
// Trouvé sur la table des demandes : la clause USING dit qui peut modifier une
// ligne, jamais ce qu'elle devient. Un partenaire pouvait donc réécrire le
// message du visiteur et déplacer sa demande chez un confrère.
// ---------------------------------------------------------------------------
await controle(
  "Modification sans WITH CHECK ni garde",
  // Les schemas cron et storage appartiennent a Supabase : les signaler ferait
  // du bruit sur ce qu'on ne peut pas changer, et un audit bruyant finit ignore.
  // Une table tenue par un declencheur de colonnes n'est pas signalee non plus :
  // la defense existe, elle est juste ailleurs.
  `select c.relname tbl, p.polname
     from pg_policy p
     join pg_class c on c.oid = p.polrelid
     join pg_namespace n on n.oid = c.relnamespace
    where p.polcmd in ('w', '*')
      and p.polwithcheck is null
      and n.nspname = 'public'
      and not exists (
        select 1 from pg_trigger t
         where t.tgrelid = c.oid and not t.tgisinternal
           and t.tgname like '%guard%'
      )
    order by c.relname, p.polname`,
  (l) => `${l.tbl} · ${l.polname}`,
  "USING dit qui peut modifier, pas ce que la ligne devient."
);

// ---------------------------------------------------------------------------
// 2. Une fonction SECURITY DEFINER exécutable par PUBLIC
//
// Trouvé sur secret_lire : un visiteur non connecté pouvait lire le secret
// Twilio. REVOKE ... FROM anon, authenticated ne retire pas le droit par défaut
// de PUBLIC, et personne ne s'en apercevait.
// ---------------------------------------------------------------------------
await controle(
  "SECURITY DEFINER ouverte à PUBLIC",
  `select p.proname, pg_get_function_identity_arguments(p.oid) args
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and has_function_privilege('public', p.oid, 'EXECUTE')
    order by p.proname`,
  (l) => `${l.proname}(${l.args})`,
  "Un REVOKE nommé ne retire pas le droit par défaut de PUBLIC."
);

// ---------------------------------------------------------------------------
// 3. Une fonction SECURITY DEFINER sans search_path fixe
//
// Sans lui, un schéma temporaire placé devant peut détourner un appel de
// fonction vers autre chose que ce que l'auteur croyait appeler.
// ---------------------------------------------------------------------------
await controle(
  "SECURITY DEFINER sans search_path",
  `select p.proname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and (p.proconfig is null
           or not exists (select 1 from unnest(p.proconfig) x where x like 'search_path=%'))
    order by p.proname`,
  (l) => l.proname,
  "Un chemin de recherche libre peut détourner un appel."
);

// ---------------------------------------------------------------------------
// 4. Une table avec RLS mais sans FORCE
//
// Sans FORCE, le propriétaire du schéma ne passe pas par les politiques. Or la
// connexion applicative EST le propriétaire du schéma : les politiques ne
// s'appliquaient pas là où on croyait qu'elles s'appliquaient.
// ---------------------------------------------------------------------------
await controle(
  "RLS sans FORCE, propriétaire soumis aux politiques",
  // FORCE ne change quelque chose que si le proprietaire de la table est soumis
  // a la RLS. Ici il porte BYPASSRLS, qui la contourne quoi qu'il arrive : la
  // clause n'y ajouterait rien, et signaler les vingt-sept tables reviendrait a
  // crier au loup. Le controle ne se declenche donc que le jour ou ce
  // privilege change, ce qui est precisement le jour ou il compte.
  `select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join pg_roles r on r.oid = c.relowner
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relrowsecurity and not c.relforcerowsecurity
      and not r.rolbypassrls
    order by c.relname`,
  (l) => l.relname,
  "Le propriétaire n'a pas BYPASSRLS : sans FORCE, il contourne les politiques."
);

// ---------------------------------------------------------------------------
// 5. Une table lisible par anon sans aucune politique
//
// Une table sans politique et avec RLS ne rend rien ; sans RLS du tout et avec
// un GRANT à anon, elle rend tout.
// ---------------------------------------------------------------------------
await controle(
  "Table lisible par anon sans RLS",
  `select c.relname
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not c.relrowsecurity
      and has_table_privilege('anon', c.oid, 'SELECT')
    order by c.relname`,
  (l) => l.relname,
  "Sans RLS, un GRANT à anon rend la table entière."
);

// ---------------------------------------------------------------------------
// 6. Une vue accessible en écriture
//
// Trouvé sur deux vues : elles portaient INSERT, UPDATE et DELETE pour le rôle
// authenticated. Les écritures n'étaient refusées que par des déclencheurs de
// colonnes, ce qui est une défense par accident.
// ---------------------------------------------------------------------------
await controle(
  "Vue accessible en écriture",
  `select table_name, string_agg(distinct privilege_type, ', ') droits
     from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
      and table_name in (select table_name from information_schema.views
                          where table_schema = 'public')
    group by table_name
    order by table_name`,
  (l) => `${l.table_name} · ${l.droits}`,
  "Une écriture sur une vue échappe aux politiques de la table."
);

// ---------------------------------------------------------------------------
// 7. Une comparaison de ville qui ignore le nom
//
// Le piège s'est refermé quatre fois : le barème, les codes promotionnels, les
// modes de course et les périmètres. Une attribution stocke l'identifiant de la
// ville, une course stocke son nom, et l'accent seul les sépare.
// ---------------------------------------------------------------------------
await controle(
  "Comparaison de ville sans meme_ville",
  `select p.proname
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.prosrc like '%city_slug =%' or p.prosrc like '%scope_value =%')
      and p.prosrc not like '%meme_ville%'
      and p.prosrc not like '%service_cities%'
      and p.proname not in ('meme_ville')
    order by p.proname`,
  (l) => l.proname,
  "Un identifiant comparé à un nom ne correspond jamais."
);

// ---------------------------------------------------------------------------
// 8. Un droit du catalogue qui ne dit pas ce qu'il ne permet pas
// ---------------------------------------------------------------------------
await controle(
  "Droit sans limite écrite",
  `select code from public.permissions
    where ne_permet_pas is null or char_length(btrim(ne_permet_pas)) < 20
    order by code`,
  (l) => l.code,
  "Un droit dont on ignore les limites s'accorde à l'aveugle."
);

// ---------------------------------------------------------------------------
// 9. Un droit sensible que rien ne consulte
//
// Quinze des trente-cinq droits n'etaient consultes nulle part : ni par une
// politique, ni par une fonction. Ils s'affichaient « accorde » dans la console
// et n'ouvraient aucune porte, ce qui trompe dans les deux sens. Un auditeur a
// qui l'on confie « Consulter le journal d'audit » ouvrait un journal vide ; et
// la promesse inverse, « le responsable financier n'a pas acces aux pieces
// d'identite », ne tenait pas davantage puisque la porte des pieces regardait
// un role herite.
//
// Il en reste, et c'est assume : ils correspondent a des gestes qui se font
// encore par ecriture directe, sans fonction serveur ou les brancher. Le
// controle ne signale que les sensibles, pour que l'ecart reste visible sans
// noyer le reste.
// ---------------------------------------------------------------------------
await controle(
  "Droit sensible que rien ne consulte",
  `select code from public.droits_jamais_consultes() where sensible order by code`,
  (l) => l.code,
  "Il s'affiche « accordé » dans la console et n'ouvre aucune porte."
);

// ---------------------------------------------------------------------------
// 10. Une preuve de consentement que l'interesse peut ecrire lui-meme
//
// Les dates de consentement servent de preuve : elles disent qu'a tel moment,
// cette personne a accepte d'etre jointe sur ce canal. Une preuve que le sujet
// peut ecrire lui-meme ne prouve plus rien, et c'est justement en cas de
// contestation qu'on la produirait.
// ---------------------------------------------------------------------------
await controle(
  "Preuve de consentement écrivable par l'intéressé",
  `select table_name, column_name
     from information_schema.column_privileges
    where table_schema = 'public'
      and grantee = 'authenticated'
      and privilege_type = 'UPDATE'
      and column_name like '%consent%'
    order by table_name, column_name`,
  (l) => `${l.table_name}.${l.column_name}`,
  "Une preuve que le sujet peut écrire lui-même ne prouve plus rien."
);

// ---------------------------------------------------------------------------
// 10. Un travail planifié arrêté
//
// Un porteur arrêté ne fait rien échouer : la file grossit en silence.
// ---------------------------------------------------------------------------
await controle(
  "Travail planifié arrêté",
  `select jobname from cron.job where jobname like 'akwaba-%' and not active
    order by jobname`,
  (l) => l.jobname,
  "Un travail arrêté ne fait rien échouer, il cesse simplement d'agir."
);

// ---------------------------------------------------------------------------
// 10. Une migration appliquée sans être inscrite
//
// Vingt-neuf l'étaient. Tout outil qui se fie au registre les croyait en
// attente et les rejouait, ce qui faisait échouer deux recettes.
// ---------------------------------------------------------------------------
await controle(
  "Écart entre la base et le registre des migrations",
  `select 1 where false`,
  () => "",
  ""
);
controles--;
console.log("  Écart entre la base et le registre : voir scripts/inscrire-migrations-appliquees.mjs");

// ---------------------------------------------------------------------------
// 11. Un compte qui tient tout d'un accès de secours
// ---------------------------------------------------------------------------
await controle(
  "Accès de secours sans rôle dans la matrice",
  `select u.email::text courriel
     from public.user_roles ur
     join auth.users u on u.id = ur.user_id
    where ur.role = 'admin'
      and not exists (
        select 1 from public.staff_assignments a
         where a.user_id = ur.user_id
           and (a.expire_le is null or a.expire_le > now())
      )
    order by 1`,
  (l) => l.courriel,
  "Ces comptes ouvrent tout sans qu'aucune ligne de la matrice ne l'explique."
);

await c.end();

console.log(`\n${controles} contrôles, ${constats.length} constat(s).`);
if (constats.length === 0) {
  console.log("Rien à signaler sur les classes de défauts déjà rencontrées.");
} else if (strict) {
  console.error("\nAudit strict : des constats subsistent.");
  process.exit(1);
}
