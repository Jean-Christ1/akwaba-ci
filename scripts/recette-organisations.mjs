/**
 * Recette des comptes entreprises, contre la vraie base, en transaction annulée.
 *
 * Une organisation partage un historique de courses entre plusieurs personnes.
 * Ce qui se partage doit être exactement ce qui doit l'être : le suivi et les
 * montants, jamais l'adresse personnelle ni les notes d'un collègue. Et ce qui
 * se gère doit rester gérable : une organisation qui perd son dernier
 * propriétaire ne se rattrape plus.
 *
 * Trois comptes sans aucun privilège sont créés pour la transaction.
 *
 * Usage :
 *   node scripts/recette-organisations.mjs
 */
import fs from 'node:fs'
import pg from 'pg'
import { exigerConfiguration } from './lib/connexion-base.mjs'

const c = new pg.Client(exigerConfiguration("recette des organisations"))
await c.connect()

let etape = 0
const ok = []
const ko = []

const pas = async (libelle, fn) => {
  etape++
  await c.query('SAVEPOINT etape')
  try {
    const r = await fn()
    await c.query('RELEASE SAVEPOINT etape')
    ok.push(libelle)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(58)} OK${r ? '  ' + r : ''}`)
    return r
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT etape')
    ko.push(`${libelle} : ${e.message}`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(58)} ECHEC`)
    console.log(`      ${e.message.slice(0, 160)}`)
    return null
  }
}

const refus = async (libelle, fn, codes = ['42501', '22023']) => {
  etape++
  await c.query('SAVEPOINT etape')
  try {
    await fn()
    await c.query('ROLLBACK TO SAVEPOINT etape')
    ko.push(`${libelle} : ACCEPTE alors que cela devait etre refuse`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(58)} ECHEC, accepte`)
    return false
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT etape')
    if (codes.includes(e.code)) {
      ok.push(libelle)
      console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(58)} OK  refus ${e.code}`)
      return true
    }
    ko.push(`${libelle} : refus inattendu ${e.code} ${e.message}`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(58)} ECHEC, refus ${e.code}`)
    console.log(`      ${e.message.slice(0, 160)}`)
    return false
  }
}

const devenir = async (uid) => {
  await c.query('RESET ROLE')
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated' }),
  ])
  await c.query('SET LOCAL ROLE authenticated')
}
const proprietaire = () => c.query('RESET ROLE')

await c.query('BEGIN')
try {
  const dejaLa = new Set(
    (await c.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version)
  )
  const enAttente = fs
    .readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql') && !dejaLa.has(f.split('_')[0]))
    .sort()
  for (const f of enAttente) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
  console.log(`=== COMPTES ENTREPRISES, ${enAttente.length} migration(s) appliquee(s) dans la transaction ===\n`)

  const creerCompte = async (courriel) =>
    (
      await c.query(
        `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                                 email_confirmed_at, created_at, updated_at)
         VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
                 'authenticated', $1, '', now(), now(), now())
         RETURNING id`,
        [courriel]
      )
    ).rows[0].id

  const PATRON = await creerCompte('patron-org@example.invalid')
  const EMPLOYE = await creerCompte('employe-org@example.invalid')
  const ETRANGER = await creerCompte('etranger-org@example.invalid')
  for (const [uid, nom] of [[PATRON, 'Patron'], [EMPLOYE, 'Employe'], [ETRANGER, 'Etranger']]) {
    await c.query(
      `INSERT INTO public.profiles (id, display_name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name`,
      [uid, nom]
    )
  }

  const org = await pas('Le patron cree son organisation et en est proprietaire', async () => {
    await devenir(PATRON)
    const r = await c.query(
      `SELECT (public.organisation_create($1, $2, $3)).id AS id`,
      ['Hotel des Palmiers', 'reservation@example.invalid', '+2250700000000']
    )
    const id = r.rows[0].id
    await proprietaire()
    const role = (await c.query(
      'SELECT role FROM public.organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [id, PATRON]
    )).rows[0]?.role
    if (role !== 'owner') throw new Error('le createur n est pas proprietaire : ' + role)
    return id
  })

  const code = await pas('Le code d adhesion est reserve aux responsables', async () => {
    await devenir(PATRON)
    const r = await c.query('SELECT public.organisation_join_code($1) AS code', [org])
    const v = r.rows[0].code
    if (!v || v.length < 8) throw new Error('code inattendu : ' + v)
    return v.length + ' caracteres'
  })

  await refus("Un etranger ne peut pas lire le code d adhesion", async () => {
    await devenir(ETRANGER)
    await c.query('SELECT public.organisation_join_code($1)', [org])
  })

  await pas('Un employe rejoint par le code, meme mal recopie', async () => {
    await proprietaire()
    const v = (await c.query('SELECT join_code FROM public.organisations WHERE id = $1', [org])).rows[0].join_code
    await devenir(EMPLOYE)
    // Le code se dicte de vive voix : un espace de trop ne doit pas devenir un
    // refus incomprehensible.
    await c.query('SELECT public.organisation_join($1)', [' ' + v.toLowerCase() + ' '])
    await proprietaire()
    const role = (await c.query(
      'SELECT role FROM public.organisation_members WHERE organisation_id = $1 AND user_id = $2',
      [org, EMPLOYE]
    )).rows[0]?.role
    if (role !== 'member') throw new Error('role inattendu : ' + role)
    return 'role ' + role
  })

  await refus("Un code inconnu ne dit pas s il a existe", async () => {
    await devenir(ETRANGER)
    await c.query('SELECT public.organisation_join($1)', ['CODEINCONNU9'])
  })

  const course = await pas("L employe rattache sa course a l organisation", async () => {
    await devenir(EMPLOYE)
    const r = await c.query(
      `SELECT (public.errand_create(
         'Courses du restaurant', 'grocery', 'Abidjan', 'Cocody',
         'Rue des Jardins, Cocody', '[{"label":"Riz","qty":"2"}]'::jsonb,
         15000, 'Code portail 4512', 'chat', NULL, 'wave', 'moto', 'small', 'standard',
         6.5, 75, 'runner_delivers', NULL, 'customer_advance', 5.35, -3.98
       )).id AS id`
    )
    const id = r.rows[0].id
    await c.query('SELECT public.errand_set_organisation($1, $2)', [id, org])
    await proprietaire()
    const v = (await c.query('SELECT organisation_id FROM public.errands WHERE id = $1', [id])).rows[0].organisation_id
    if (v !== org) throw new Error('rattachement absent')
    return id
  })

  await refus("Un etranger ne peut pas rattacher une course a cette organisation", async () => {
    await devenir(ETRANGER)
    const r = await c.query(
      `SELECT (public.errand_create(
         'Course perso', 'grocery', 'Abidjan', 'Cocody', 'Ailleurs',
         '[{"label":"Pain","qty":"1"}]'::jsonb, 2000, NULL, 'chat', NULL, 'wave',
         'moto', 'small', 'standard', 2, 20, 'runner_delivers', NULL, 'on_delivery', NULL, NULL
       )).id AS id`
    )
    await c.query('SELECT public.errand_set_organisation($1, $2)', [r.rows[0].id, org])
  })

  await pas("Le patron suit les courses de son organisation", async () => {
    await devenir(PATRON)
    const r = await c.query('SELECT * FROM public.organisation_errands($1)', [org])
    if (r.rows.length !== 1) throw new Error(r.rows.length + ' course(s) au lieu d une')
    const l = r.rows[0]
    if (l.demandeur !== 'Employe') throw new Error('demandeur inattendu : ' + l.demandeur)
    // Le suivi ne doit porter ni adresse ni notes : un collegue n a pas a lire
    // l adresse personnelle d un autre.
    const colonnes = Object.keys(l)
    for (const interdite of ['delivery_address', 'notes', 'handover_code', 'third_party_contact']) {
      if (colonnes.includes(interdite)) throw new Error('colonne privee exposee : ' + interdite)
    }
    return `${r.rows.length} course, demandeur ${l.demandeur}, ${colonnes.length} colonnes, aucune privee`
  })

  await refus("Un etranger ne voit pas les courses de l organisation", async () => {
    await devenir(ETRANGER)
    await c.query('SELECT * FROM public.organisation_errands($1)', [org])
  })

  await pas("Un membre ne lit toujours pas l adresse d une course d un collegue", async () => {
    await devenir(PATRON)
    const r = await c.query('SELECT id FROM public.errands WHERE id = $1', [course])
    // La politique de lecture des courses n a pas ete elargie : le patron n est
    // ni le client ni le shopper de cette course.
    if (r.rows.length !== 0) throw new Error('la ligne de course est visible, elle porte l adresse')
    return 'ligne invisible, adresse et notes hors de portee'
  })

  // Un non-membre n a aucun role : la comparaison rendait l inconnu, qui n est
  // pas vrai, donc la garde ne se declenchait pas. Les trois fonctions qui la
  // portaient sont eprouvees.
  await refus("Un etranger ne peut pas retirer un membre", async () => {
    await devenir(ETRANGER)
    await c.query('SELECT public.organisation_remove_member($1, $2)', [org, EMPLOYE])
  })

  await refus("Un etranger ne peut pas renouveler le code", async () => {
    await devenir(ETRANGER)
    await c.query('SELECT public.organisation_rotate_join_code($1)', [org])
  })

  await refus("Un membre ordinaire ne change pas les roles", async () => {
    await devenir(EMPLOYE)
    await c.query('SELECT public.organisation_set_member_role($1, $2, $3)', [org, PATRON, 'member'])
  })

  await refus("Le dernier proprietaire ne peut pas se retrograder", async () => {
    await devenir(PATRON)
    await c.query('SELECT public.organisation_set_member_role($1, $2, $3)', [org, PATRON, 'member'])
  })

  await refus("Le dernier proprietaire ne peut pas quitter l organisation", async () => {
    await devenir(PATRON)
    await c.query('SELECT public.organisation_remove_member($1, $2)', [org, PATRON])
  })

  await pas("Un second proprietaire nomme, le premier peut alors partir", async () => {
    await devenir(PATRON)
    await c.query('SELECT public.organisation_set_member_role($1, $2, $3)', [org, EMPLOYE, 'owner'])
    await c.query('SELECT public.organisation_remove_member($1, $2)', [org, PATRON])
    await proprietaire()
    const r = await c.query(
      "SELECT count(*)::int n FROM public.organisation_members WHERE organisation_id = $1 AND role = 'owner'",
      [org]
    )
    if (r.rows[0].n !== 1) throw new Error(r.rows[0].n + ' proprietaire(s)')
    return 'un proprietaire subsiste'
  })

  await pas("Renouveler le code coupe l ancien", async () => {
    await devenir(EMPLOYE)
    const neuf = (await c.query('SELECT public.organisation_rotate_join_code($1) AS c', [org])).rows[0].c
    if (!neuf || neuf === code) throw new Error('le code n a pas change')
    await devenir(ETRANGER)
    let refuse = false
    await c.query('SAVEPOINT ancien')
    try {
      await c.query('SELECT public.organisation_join($1)', [code])
      await c.query('ROLLBACK TO SAVEPOINT ancien')
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT ancien')
      refuse = e.code === '22023'
    }
    if (!refuse) throw new Error("l ancien code fonctionne encore")
    return 'ancien code refuse'
  })

  console.log('\n=== RESULTAT ===')
  console.log(`  etapes reussies : ${ok.length}`)
  console.log(`  etapes en echec : ${ko.length}`)
  ko.forEach((k) => console.log('   - ' + k))
  process.exitCode = ko.length ? 1 : 0
} finally {
  await c.query('ROLLBACK')
  await c.end()
  console.log('\n(transaction annulee : la base est intacte)')
}
