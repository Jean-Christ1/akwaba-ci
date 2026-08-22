/**
 * Recette des gardes d'argent, contre la vraie base, en transaction annulée.
 *
 * Quatre défaillances ont été constatées par un audit adverse, toutes muettes :
 * rien n'échouait, les écrans s'affichaient, et l'argent partait de travers.
 * Ce parcours les rejoue une par une, avec des comptes créés sans aucun
 * privilège : réutiliser un compte existant prouverait le contraire de ce que
 * l'on croit prouver, puisque le seul compte de la base porte le rôle
 * administrateur, que les gardes laissent passer par conception.
 *
 * Les migrations en attente sont appliquées dans la transaction, puis tout est
 * annulé. La base ressort intacte.
 *
 * Usage :
 *   node scripts/recette-gardes.mjs
 */
import fs from 'node:fs'
import pg from 'pg'
import { exigerConfiguration } from './lib/connexion-base.mjs'

const c = new pg.Client(exigerConfiguration("recette des gardes"))
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
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(56)} OK${r ? '  ' + r : ''}`)
    return r
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT etape')
    ko.push(`${libelle} : ${e.message}`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(56)} ECHEC`)
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
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(56)} ECHEC, accepte`)
    return false
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT etape')
    if (codes.includes(e.code)) {
      ok.push(libelle)
      console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(56)} OK  refus ${e.code}`)
      return true
    }
    ko.push(`${libelle} : refus inattendu ${e.code} ${e.message}`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(56)} ECHEC, refus ${e.code}`)
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
  console.log(`=== GARDES D ARGENT, ${enAttente.length} migration(s) appliquee(s) dans la transaction ===\n`)

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

  const CLIENT = await creerCompte('client-gardes@example.invalid')
  const SHOPPER = await creerCompte('shopper-gardes@example.invalid')
  const MODERATEUR = await creerCompte('moderateur-gardes@example.invalid')
  await c.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'moderator')`, [MODERATEUR])

  await c.query(
    `INSERT INTO public.runner_profiles (user_id, full_name, phone, city, vehicle, status)
     VALUES ($1, 'Shopper des gardes', '+2250000001', 'Abidjan', 'moto', 'approved')
     ON CONFLICT (user_id) DO UPDATE SET status = 'approved'`,
    [SHOPPER]
  )

  const nouvelleCourse = async (titre) => {
    await devenir(CLIENT)
    const r = await c.query(
      `SELECT (public.errand_create(
         $1, 'grocery', 'Abidjan', 'Cocody',
         'Rue des Jardins, Cocody', '[{"label":"Riz","qty":"2"}]'::jsonb,
         20000, NULL, 'chat', NULL, 'wave', 'moto', 'small', 'standard',
         6.5, 75, 'runner_delivers', NULL, 'customer_advance', 5.35, -3.98
       )).id AS id`,
      [titre]
    )
    const id = r.rows[0].id
    await proprietaire()
    const offre = (
      await c.query(
        `INSERT INTO public.errand_offers (errand_id, runner_id, price, eta_minutes)
         VALUES ($1, $2, 2500, 60) RETURNING id`,
        [id, SHOPPER]
      )
    ).rows[0].id
    await devenir(CLIENT)
    await c.query('SELECT public.errand_accept_offer($1)', [offre])
    return id
  }

  const course1 = await pas('Une course est attribuee au shopper', async () => {
    await proprietaire()
    return nouvelleCourse('Course des gardes 1')
  })
  // Le marqueur du moteur vit le temps de la transaction. Une fonction
  // appelee plus haut l'a arme ; en production chaque appel a sa propre
  // transaction, donc il ne survit jamais. Ici tout tient dans une seule
  // transaction : on le desarme pour eprouver la garde dans les conditions
  // reelles, et non a travers une porte que personne n'aurait ouverte.
  await proprietaire()
  await c.query("SELECT set_config('app.errand_engine', 'off', true)")


  await refus("Le shopper ne peut plus se declarer la remise verifiee", async () => {
    await devenir(SHOPPER)
    await c.query('UPDATE public.errands SET handover_verified_at = now() WHERE id = $1', [course1])
  })

  await refus("Le shopper ne peut pas davantage se donner un gain", async () => {
    await devenir(SHOPPER)
    await c.query('UPDATE public.errands SET runner_payout = 999999 WHERE id = $1', [course1])
  })

  await pas("La reouverture de remise n'a qu'une signature", async () => {
    await proprietaire()
    const r = await c.query(
      `select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname='public' and p.proname='errand_unlock_handover'`
    )
    if (r.rows[0].n !== 1) throw new Error(`${r.rows[0].n} signatures, l'appel resterait ambigu`)
    return 'une seule, appelable sans ambiguite'
  })

  await pas('Cinq codes errones verrouillent la remise, un moderateur la rouvre', async () => {
    await proprietaire()
    const bloquee = await nouvelleCourse('Course des gardes verrou')
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [bloquee, 'shopping'])
    await c.query('SELECT public.errand_advance_status($1, $2)', [bloquee, 'delivering'])

    // Le verrou se produit comme dans la vraie vie : cinq codes faux de suite,
    // par la fonction dediee. C'est elle qui compte les echecs ; la progression
    // de statut, elle, leve une exception sur un code faux, ce qui annulerait
    // le compteur qu'elle vient d'incrementer. L'ecran appelle bien les deux
    // dans cet ordre.
    for (let i = 0; i < 5; i++) {
      await c.query('SELECT public.errand_verify_handover_code($1, $2)', [bloquee, '0000'])
    }

    await proprietaire()
    const verrou = await c.query(
      'SELECT handover_locked_at, handover_attempts FROM public.errands WHERE id = $1',
      [bloquee]
    )
    if (verrou.rows[0].handover_locked_at === null) {
      throw new Error('la remise aurait du se verrouiller apres cinq codes errones')
    }

    await devenir(MODERATEUR)
    await c.query('SELECT public.errand_unlock_handover($1, $2)', [
      bloquee,
      'Code perdu par le client, identite verifiee par telephone',
    ])

    await proprietaire()
    const apres = await c.query(
      'SELECT handover_locked_at, handover_attempts FROM public.errands WHERE id = $1',
      [bloquee]
    )
    if (apres.rows[0].handover_locked_at !== null) throw new Error('la remise est restee verrouillee')

    const trace = await c.query(
      "SELECT count(*)::int n FROM public.audit_logs WHERE entity = 'errand_handover' AND entity_id = $1",
      [bloquee]
    )
    if (trace.rows[0].n === 0) throw new Error("la reouverture n'a laisse aucune trace d'audit")

    return `verrou pose puis leve, ${trace.rows[0].n} trace(s) d'audit`
  })

  await pas('Le shopper achete et enregistre sa facture', async () => {
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [course1, 'shopping'])
    await c.query('SELECT public.errand_save_invoice($1, $2, $3, $4, $5)', [
      course1, 40000, 0, 0, 'https://exemple.invalid/recu.jpg',
    ])
    await proprietaire()
    const r = await c.query('SELECT items_total FROM public.errands WHERE id = $1', [course1])
    return `achats ${r.rows[0].items_total}`
  })

  await refus("Le client ne peut plus annuler une course deja achetee", async () => {
    await devenir(CLIENT)
    await c.query('SELECT public.errand_cancel($1, $2)', [course1, 'Je ne veux plus'])
  })

  await pas("Le client peut encore annuler une course sans achat", async () => {
    await proprietaire()
    const course2 = await nouvelleCourse('Course des gardes 2')
    await devenir(CLIENT)
    await c.query('SELECT public.errand_cancel($1, $2)', [course2, 'Changement de programme'])
    await proprietaire()
    const r = await c.query('SELECT status FROM public.errands WHERE id = $1', [course2])
    if (r.rows[0].status !== 'cancelled') throw new Error('la course n a pas ete annulee')
    return 'annulation toujours possible avant tout achat'
  })

  await pas('Un litige tranche en faveur du shopper credite le shopper', async () => {
    await proprietaire()
    const course3 = await nouvelleCourse('Course des gardes 3')
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [course3, 'shopping'])
    await c.query('SELECT public.errand_advance_status($1, $2)', [course3, 'delivering'])

    await devenir(CLIENT)
    await c.query('SELECT public.errand_open_dispute($1, $2)', [course3, 'Le shopper ne repond plus depuis une heure'])

    await proprietaire()
    const avant = await c.query(
      `SELECT COALESCE(commission_due, 0) AS cd, COALESCE(lifetime_earnings, 0) AS g
       FROM public.runner_wallets WHERE user_id = $1`,
      [SHOPPER]
    )
    const cd0 = Number(avant.rows[0]?.cd ?? 0)
    const g0 = Number(avant.rows[0]?.g ?? 0)

    await devenir(MODERATEUR)
    await c.query('SELECT public.errand_resolve_dispute($1, $2, $3)', [course3, 'shopper', 'Preuves a l appui'])

    await proprietaire()
    const apres = await c.query(
      `SELECT COALESCE(commission_due, 0) AS cd, COALESCE(lifetime_earnings, 0) AS g
       FROM public.runner_wallets WHERE user_id = $1`,
      [SHOPPER]
    )
    const cd1 = Number(apres.rows[0]?.cd ?? 0)
    const g1 = Number(apres.rows[0]?.g ?? 0)
    const ecritures = await c.query(
      `SELECT count(*)::int n FROM public.wallet_entries
       WHERE errand_id = $1 AND kind IN ('earning','commission','commission_due')`,
      [course3]
    )

    if (ecritures.rows[0].n === 0) throw new Error('aucune ecriture : le shopper n a rien touche')
    if (g1 <= g0) throw new Error(`les gains cumules n ont pas bouge (${g0} puis ${g1})`)
    return `commission due ${cd0} puis ${cd1}, gains ${g0} puis ${g1}, ${ecritures.rows[0].n} ecriture(s)`
  })

  await pas('La cloture ne credite jamais deux fois', async () => {
    await proprietaire()
    const course4 = await nouvelleCourse('Course des gardes 4')
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [course4, 'shopping'])
    await c.query('SELECT public.errand_advance_status($1, $2)', [course4, 'delivering'])
    await proprietaire()
    const code = (await c.query('SELECT handover_code FROM public.errands WHERE id = $1', [course4])).rows[0].handover_code
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2, $3)', [course4, 'delivered', code])
    await devenir(CLIENT)
    await c.query('SELECT public.errand_confirm_payment($1)', [course4])
    await proprietaire()
    const un = await c.query(
      `SELECT count(*)::int n FROM public.wallet_entries WHERE errand_id = $1 AND kind = 'commission_due'`, [course4]
    )
    await c.query('SELECT public.errand_settle_runner($1)', [course4])
    const deux = await c.query(
      `SELECT count(*)::int n FROM public.wallet_entries WHERE errand_id = $1 AND kind = 'commission_due'`, [course4]
    )
    if (deux.rows[0].n !== un.rows[0].n) throw new Error(`ecritures ${un.rows[0].n} puis ${deux.rows[0].n}`)
    return `${un.rows[0].n} ecriture, inchangee apres rejeu`
  })

  // --- La ville fermee et le mode de reglement -----------------------------
  await refus('Une course ne part pas dans une ville fermee aux courses', async () => {
    await devenir(CLIENT)
    await c.query(
      `SELECT public.errand_create(
         'Course a Bouake', 'grocery', 'Bouaké', 'Centre',
         'Quartier commerce, Bouaké', '[{"label":"Riz","qty":"1"}]'::jsonb,
         5000, NULL, 'chat', NULL, 'wave', 'moto', 'small', 'standard',
         3, 30, 'runner_delivers', NULL, 'on_delivery', NULL, NULL
       )`
    )
  })

  await refus('Une ville inconnue est refusee aussi', async () => {
    await devenir(CLIENT)
    await c.query(
      `SELECT public.errand_create(
         'Course ailleurs', 'grocery', 'Tombouctou', NULL,
         'Une adresse quelconque', '[{"label":"Riz","qty":"1"}]'::jsonb,
         5000, NULL, 'chat', NULL, 'wave', 'moto', 'small', 'standard',
         3, 30, 'runner_delivers', NULL, 'on_delivery', NULL, NULL
       )`
    )
  })

  await pas('Une course part toujours dans une ville ouverte', async () => {
    await proprietaire()
    const id = await nouvelleCourse('Course des gardes ville')
    if (!id) throw new Error('la course n a pas ete creee')
    return 'Abidjan accepte'
  })

  await pas('Publier un bareme conserve le mode de reglement', async () => {
    await proprietaire()
    // Le mode n'etait jamais ecrit : il retombait sur le defaut de la colonne.
    // On passe volontairement au sequestre, puis on publie sans le preciser.
    await c.query("UPDATE public.commission_rules SET settlement = 'escrow' WHERE is_active")
    const admin = await creerCompte('admin-gardes@example.invalid')
    await c.query(`INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'admin')`, [admin])
    await devenir(admin)
    await c.query(
      'SELECT public.commission_rule_publish($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [0.15, 1000, 2000, 24, 20, 15, 2, 100, 2, 20, 2000]
    )
    await proprietaire()
    const r = await c.query('SELECT settlement, base FROM public.commission_rules WHERE is_active')
    if (r.rows[0].settlement !== 'escrow') {
      throw new Error('mode renverse en ' + r.rows[0].settlement)
    }
    return 'sequestre conserve, assiette ' + r.rows[0].base
  })

  // --- Le gel reel et la trace des decisions -------------------------------
  await pas('Le montant gele est celui des ecritures, pas le gain theorique', async () => {
    await proprietaire()
    const litige = await nouvelleCourse('Course des gardes litige')
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [litige, 'shopping'])
    await devenir(CLIENT)
    await c.query('SELECT public.errand_open_dispute($1, $2)', [litige, 'Le shopper ne repond plus depuis deux heures'])
    await devenir(MODERATEUR)
    const r = await c.query('SELECT gele FROM public.dispute_frozen_amounts() WHERE errand_id = $1', [litige])
    await proprietaire()
    const theorique = Number((await c.query('SELECT runner_payout FROM public.errands WHERE id = $1', [litige])).rows[0].runner_payout)
    const gele = Number(r.rows[0]?.gele ?? -1)
    if (gele !== 0) throw new Error('gel attendu a zero avant tout reglement, obtenu ' + gele)
    if (theorique <= 0) throw new Error('le gain theorique devrait etre non nul, il vaut ' + theorique)
    return 'gele ' + gele + ', gain theorique ' + theorique + ' : les deux sont bien distincts'
  })

  await refus('Un shopper ne change pas son propre statut', async () => {
    await proprietaire()
    const dossier = (await c.query('SELECT id FROM public.runner_profiles WHERE user_id = $1', [SHOPPER])).rows[0].id
    await devenir(SHOPPER)
    await c.query('SELECT public.runner_set_status($1, $2, $3)', [dossier, 'approved', null])
  })

  await refus('Suspendre sans motif est refuse', async () => {
    await proprietaire()
    const dossier = (await c.query('SELECT id FROM public.runner_profiles WHERE user_id = $1', [SHOPPER])).rows[0].id
    await devenir(MODERATEUR)
    await c.query('SELECT public.runner_set_status($1, $2, $3)', [dossier, 'suspended', null])
  })

  await pas('Suspendre avec motif laisse une trace nominative', async () => {
    await proprietaire()
    const dossier = (await c.query('SELECT id FROM public.runner_profiles WHERE user_id = $1', [SHOPPER])).rows[0].id
    await devenir(MODERATEUR)
    await c.query('SELECT public.runner_set_status($1, $2, $3)', [dossier, 'suspended', 'Trois remises contestees en une semaine'])
    await proprietaire()
    const t = await c.query(
      "SELECT actor_id, details FROM public.audit_logs WHERE entity = 'runner_profile' AND entity_id = $1 ORDER BY created_at DESC LIMIT 1",
      [dossier]
    )
    if (!t.rows.length) throw new Error('aucune trace d audit')
    if (t.rows[0].actor_id !== MODERATEUR) throw new Error('acteur inattendu')
    if (!String(t.rows[0].details.motif).includes('remises contestees')) throw new Error('motif absent de la trace')
    const s = (await c.query("SELECT status FROM public.runner_profiles WHERE id = $1", [dossier])).rows[0].status
    if (s !== 'suspended') throw new Error('statut non applique : ' + s)
    // Une epreuve ne doit pas laisser le monde change pour la suivante : le
    // dossier est remis en etat valide.
    await c.query("UPDATE public.runner_profiles SET status = 'approved' WHERE id = $1", [dossier])
    return 'statut ' + s + ', acteur et motif inscrits'
  })

  // --- La tolerance de remplacement -----------------------------------------
  await pas('Un equivalent nettement plus cher est soumis au client', async () => {
    await proprietaire()
    const course = await nouvelleCourse('Course des gardes remplacement')
    await devenir(CLIENT)
    await c.query('SELECT public.errand_set_substitution_policy($1, $2)', [course, 'similar'])
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [course, 'shopping'])
    await proprietaire()
    const article = (await c.query(
      'SELECT id FROM public.errand_items WHERE errand_id = $1 ORDER BY position LIMIT 1', [course]
    )).rows[0].id
    const budget = Number((await c.query(
      'SELECT budget_estimate FROM public.errands WHERE id = $1', [course]
    )).rows[0].budget_estimate)
    // Le defaut n apparait qu avec plusieurs articles : avec un seul, la part
    // du budget EST le budget et les deux regles se confondent. On complete le
    // panier a cinq articles, ce qui est le cas courant.
    for (let k = 2; k <= 5; k++) {
      await c.query(
        'INSERT INTO public.errand_items (errand_id, position, label, qty) VALUES ($1, $2, $3, $4)',
        [course, k, 'Article ' + k, '1']
      )
    }
    // Prix bien au-dessus de la part par article (budget / 5), mais sous le
    // budget entier majore : exactement le cas qui passait sans un mot.
    const prix = Math.round(budget * 0.8)
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_item_report($1, $2, $3, $4)', [article, 'substitute', 'Riz importe', prix])
    await proprietaire()
    const etat = (await c.query(
      'SELECT state, decided_at FROM public.errand_items WHERE id = $1', [article]
    )).rows[0]
    if (etat.state !== 'substitute') throw new Error('accepte d office : ' + etat.state)
    if (etat.decided_at) throw new Error('date de decision posee sans decision')
    const notif = (await c.query(
      "SELECT count(*)::int n FROM public.notification_outbox WHERE errand_id = $1 AND event LIKE 'item_substitute%'",
      [course]
    )).rows[0].n
    if (notif === 0) throw new Error('le client n a pas ete prevenu')
    return 'budget ' + budget + ', prix propose ' + prix + ' : soumis au client, ' + notif + ' notification'
  })

  await pas('Un equivalent a prix voisin reste accepte d avance', async () => {
    await proprietaire()
    const course = await nouvelleCourse('Course des gardes remplacement proche')
    await devenir(CLIENT)
    await c.query('SELECT public.errand_set_substitution_policy($1, $2)', [course, 'similar'])
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [course, 'shopping'])
    await proprietaire()
    const article = (await c.query(
      'SELECT id FROM public.errand_items WHERE errand_id = $1 ORDER BY position LIMIT 1', [course]
    )).rows[0].id
    const r = await c.query(
      'SELECT budget_estimate, (SELECT count(*) FROM public.errand_items WHERE errand_id = $1) n FROM public.errands WHERE id = $1',
      [course]
    )
    const part = Number(r.rows[0].budget_estimate) / Number(r.rows[0].n)
    const prix = Math.round(part * 1.1)
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_item_report($1, $2, $3, $4)', [article, 'substitute', 'Riz voisin', prix])
    await proprietaire()
    const etat = (await c.query(
      'SELECT state FROM public.errand_items WHERE id = $1', [article]
    )).rows[0].state
    if (etat !== 'accepted') throw new Error('non accepte alors que le prix est voisin : ' + etat)
    return 'part par article ' + Math.round(part) + ', prix ' + prix + ' : accepte d avance'
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
