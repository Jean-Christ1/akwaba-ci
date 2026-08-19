/**
 * Recette du moteur de course, contre une vraie base de donnees.
 *
 * Ce script joue le parcours complet d'une course : publication, offre,
 * acceptation, execution, facture, remise avec code, cloture, credit du
 * portefeuille et maturation des gains. Il verifie aussi ce qui doit etre
 * REFUSE : un client qui reecrit ses montants, un shopper qui lit le code de
 * remise, un shopper qui se sert lui-meme, une annulation apres livraison.
 *
 * Tout se deroule dans une transaction annulee a la fin : la base n'est pas
 * modifiee. Deux comptes sans aucun privilege sont crees pour la duree du
 * test, car un compte administrateur passerait au travers des gardes et
 * validerait exactement le contraire de ce que l'on croit verifier.
 *
 * Usage :
 *   SUPABASE_DB_HOST=... SUPABASE_DB_USER=... SUPABASE_DB_PASSWORD=...  *     node scripts/recette-parcours.mjs
 *
 * Aucun identifiant n'est inscrit dans ce fichier : ils viennent de
 * l'environnement, et n'apparaissent jamais dans la sortie.
 */
import fs from 'node:fs'
import pg from 'pg'

const requis = ['SUPABASE_DB_HOST', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD']
const manquants = requis.filter((v) => !process.env[v])
if (manquants.length) {
  console.error("Variables d'environnement manquantes : " + manquants.join(', '))
  console.error('Voir docs/EXPLOITATION.md pour les renseigner sans les exposer.')
  process.exit(2)
}

const c = new pg.Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
})
await c.connect()


let etape = 0
const ok = []
const ko = []

// Chaque étape s'exécute dans son propre point de reprise : les refus que l'on
// cherche justement à provoquer avortent sinon toute la transaction, et tout ce
// qui suit échouerait pour une raison qui n'a rien à voir.
const pas = async (libelle, fn) => {
  etape++
  await c.query('SAVEPOINT etape')
  try {
    const r = await fn()
    await c.query('RELEASE SAVEPOINT etape')
    ok.push(libelle)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(52)} OK${r ? '  ' + r : ''}`)
    return r
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT etape')
    ko.push(`${libelle} : ${e.message}`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(52)} ECHEC`)
    console.log(`      ${e.message.slice(0, 150)}`)
    return null
  }
}

// Une vérification qui DOIT échouer : c'est le succès attendu.
const refus = async (libelle, fn, codes = ['42501', '22023']) => {
  etape++
  await c.query('SAVEPOINT etape')
  try {
    await fn()
    await c.query('ROLLBACK TO SAVEPOINT etape')
    ko.push(`${libelle} : l'opération a été ACCEPTÉE alors qu'elle devait être refusée`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(52)} ECHEC, operation acceptee`)
    return false
  } catch (e) {
    await c.query('ROLLBACK TO SAVEPOINT etape')
    const attendu = codes.includes(e.code)
    if (attendu) {
      ok.push(libelle)
      console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(52)} OK  refus ${e.code}`)
      return true
    }
    ko.push(`${libelle} : refus inattendu ${e.code} ${e.message}`)
    console.log(`  ${String(etape).padStart(2)}. ${libelle.padEnd(52)} ECHEC, refus ${e.code}`)
    console.log(`      ${e.message.slice(0, 150)}`)
    return false
  }
}

// Devenir tel ou tel acteur : c'est ainsi que Supabase transmet l'identité.
const devenir = async (uid) => {
  await c.query('RESET ROLE')
  await c.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: uid, role: 'authenticated' }),
  ])
  await c.query('SET LOCAL ROLE authenticated')
}
const redevenirProprietaire = () => c.query('RESET ROLE')

await c.query('BEGIN')

try {
  // Les migrations en attente sont appliquees dans la transaction : la recette
  // doit eprouver le code tel qu'il sera, pas tel qu'il etait. Tout est annule
  // a la fin, la base ressort intacte.
  {
    const dejaLa = new Set((await c.query('select version from supabase_migrations.schema_migrations')).rows.map((r) => r.version))
    const enAttente = fs.readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && !dejaLa.has(f.split('_')[0])).sort()
    for (const f of enAttente) await c.query(fs.readFileSync('supabase/migrations/' + f, 'utf8'))
    if (enAttente.length) console.log('(' + enAttente.length + ' migration(s) en attente appliquee(s) dans la transaction)')
  }

  // Deux comptes SANS AUCUN PRIVILEGE, crees pour la duree de la transaction.
  // Reutiliser un compte existant fausserait tout : le seul compte de la base
  // porte le role administrateur, que les gardes laissent passer par
  // conception. On testerait alors le contraire de ce qu'on croit tester.
  const creerCompte = async (courriel) => {
    const r = await c.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password,
                               email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
               'authenticated', $1, '', now(), now(), now())
       RETURNING id`, [courriel])
    return r.rows[0].id
  }
  const CLIENT = await creerCompte('client-recette@example.invalid')
  const SHOPPER = await creerCompte('shopper-recette@example.invalid')

  // Aucun role applicatif ne leur est attribue : ce sont des utilisateurs
  // ordinaires, exactement ce qu'il faut pour eprouver les gardes.
  const privileges = await c.query(
    `SELECT count(*)::int n FROM public.user_roles WHERE user_id = ANY($1::uuid[])
     AND role IN ('admin','moderator')`, [[CLIENT, SHOPPER]])
  if (privileges.rows[0].n > 0) throw new Error('les comptes de recette ne doivent avoir aucun privilege')

  console.log('=== PARCOURS COMPLET D UNE COURSE, CONTRE LA VRAIE BASE ===\n')

  // --- Le shopper est validé par la modération -----------------------------
  await pas('Le shopper a un dossier approuvé', async () => {
    await c.query(
      `INSERT INTO public.runner_profiles (user_id, full_name, phone, city, vehicle, status)
       VALUES ($1, 'Shopper de recette', '+2250000000', 'Abidjan', 'moto', 'approved')
       ON CONFLICT (user_id) DO UPDATE SET status = 'approved'`,
      [SHOPPER]
    )
    await c.query(
      `INSERT INTO public.runner_payout_accounts (user_id, provider, account_number, account_name)
       VALUES ($1, 'wave', '+2250000000', 'Shopper de recette')
       ON CONFLICT DO NOTHING`,
      [SHOPPER]
    )
  })

  // --- Le client publie sa course ------------------------------------------
  const errandId = await pas('Le client publie une course (errand_create)', async () => {
    await devenir(CLIENT)
    const r = await c.query(
      `SELECT (public.errand_create(
         'Courses du marché', 'grocery', 'Abidjan', 'Cocody',
         'Rue des Jardins, Cocody', '[{"label":"Riz","qty":"2"}]'::jsonb,
         15000, NULL, 'chat', NULL, 'wave', 'moto', 'small', 'standard',
         6.5, 75, 'runner_delivers', NULL, 'customer_advance', 5.35, -3.98
       )).id AS id`
    )
    return r.rows[0].id
  })

  await pas('Le serveur a fixé le prix, pas le navigateur', async () => {
    await redevenirProprietaire()
    const r = await c.query(
      'SELECT service_fee, commission_amount, commission_rate, handover_code FROM public.errands WHERE id = $1',
      [errandId]
    )
    const e = r.rows[0]
    if (!e || Number(e.service_fee) <= 0) throw new Error('aucun frais de service calculé')
    if (Number(e.commission_amount) <= 0) throw new Error('aucune commission posée')
    if (!e.handover_code) throw new Error('aucun code de remise tiré')
    return `frais ${e.service_fee}, commission ${e.commission_amount} (${e.commission_rate}), code à ${String(e.handover_code).length} chiffres`
  })

  await devenir(CLIENT)
  await refus('Le client ne peut pas réécrire les montants lui-même', () =>
    c.query('UPDATE public.errands SET service_fee = 1, commission_amount = 0 WHERE id = $1', [errandId]))

  await devenir(SHOPPER)
  await refus('Le shopper ne peut pas lire le code de remise', () =>
    c.query('SELECT handover_code FROM public.errands WHERE id = $1', [errandId]))

  await redevenirProprietaire()
  const mienne = (await c.query(
    `SELECT (public.errand_create('Ma propre course', 'grocery', 'Abidjan', 'Cocody', 'Adresse quelconque',
      '[]'::jsonb, 1000, NULL, 'chat', NULL, 'wave', 'moto', 'small', 'standard',
      2, 30, 'runner_delivers', NULL, 'customer_advance', NULL, NULL)).id AS id`)).rows[0].id
  await c.query('UPDATE public.errands SET customer_id = $1 WHERE id = $2', [SHOPPER, mienne])
  await devenir(SHOPPER)
  await refus('Le shopper ne peut pas offrir sur sa propre course', () =>
    c.query('INSERT INTO public.errand_offers (errand_id, runner_id, price, eta_minutes) VALUES ($1,$2,2000,60)',
            [mienne, SHOPPER]))

  // --- Le shopper propose son prix -----------------------------------------
  const offerId = await pas('Le shopper propose son prix', async () => {
    await devenir(SHOPPER)
    const r = await c.query(
      `INSERT INTO public.errand_offers (errand_id, runner_id, price, eta_minutes, message)
       VALUES ($1, $2, 2500, 90, 'Je suis disponible') RETURNING id`,
      [errandId, SHOPPER]
    )
    return r.rows[0].id
  })

  await pas('Le client accepte l offre (errand_accept_offer)', async () => {
    await devenir(CLIENT)
    await c.query('SELECT public.errand_accept_offer($1)', [offerId])
  })

  await pas('La course est assignée et recalculée', async () => {
    await redevenirProprietaire()
    const r = await c.query(
      'SELECT status, runner_id, service_fee, commission_amount, runner_payout, accepted_at FROM public.errands WHERE id=$1',
      [errandId]
    )
    const e = r.rows[0]
    if (e.status !== 'assigned') throw new Error('statut ' + e.status)
    if (e.runner_id !== SHOPPER) throw new Error('shopper non affecté')
    const somme = Number(e.commission_amount) + Number(e.runner_payout)
    if (Math.abs(somme - Number(e.service_fee)) > 0.01) {
      throw new Error(`commission ${e.commission_amount} + gain ${e.runner_payout} != frais ${e.service_fee}`)
    }
    return `frais ${e.service_fee} = commission ${e.commission_amount} + gain ${e.runner_payout}`
  })

  // --- La mission se déroule ------------------------------------------------
  await refus(
    'Une course deja attribuee ne peut plus etre acceptee',
    async () => {
      // Un second shopper propose, puis le client tente d'accepter cette
      // seconde offre : la course a deja son shopper. Ce cas se produit
      // reellement quand deux offres arrivent presque en meme temps et que le
      // client clique deux fois. Le refus doit etre metier et lisible, non un
      // interblocage de la base.
      await redevenirProprietaire()
      const autre = await creerCompte('shopper-concurrent@example.invalid')
      await c.query(
        `INSERT INTO public.runner_profiles (user_id, full_name, phone, city, vehicle, status)
         VALUES ($1, 'Second shopper', '+2250000001', 'Abidjan', 'moto', 'approved')`,
        [autre]
      )
      await devenir(autre)
      const offre2 = (await c.query(
        `INSERT INTO public.errand_offers (errand_id, runner_id, price, eta_minutes)
         VALUES ($1, $2, 2600, 80) RETURNING id`,
        [errandId, autre]
      )).rows[0].id

      await devenir(CLIENT)
      return c.query('SELECT public.errand_accept_offer($1)', [offre2])
    }
  )

  // --- L'avance du client : declaree, puis reconnue ------------------------
  // Une declaration du client ne prouve rien : seul celui qui recoit sait ce
  // qui est arrive sur son compte. Les deux montants doivent donc rester
  // distincts jusqu'a la confirmation, sinon la facture deduit une somme que
  // personne n'a vue, ou ne deduit rien de ce qui a ete verse.
  await pas("Le client declare l'avance envoyee", async () => {
    await devenir(CLIENT)
    await c.query('SELECT public.errand_declare_advance($1, $2)', [errandId, 12000])
    await redevenirProprietaire()
    const r = await c.query(
      'SELECT advance_declared_amount, advance_amount FROM public.errands WHERE id = $1',
      [errandId]
    )
    const d = Number(r.rows[0].advance_declared_amount)
    const a = Number(r.rows[0].advance_amount)
    if (d !== 12000) throw new Error(`montant declare attendu 12000, obtenu ${d}`)
    if (a !== 0) throw new Error(`rien ne doit etre reconnu avant confirmation, obtenu ${a}`)
    return 'declare 12000, reconnu 0'
  })

  await pas('Le shopper confirme la reception', async () => {
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_confirm_advance($1, $2)', [errandId, 12000])
    await redevenirProprietaire()
    const r = await c.query(
      'SELECT advance_amount, advance_confirmed_at FROM public.errands WHERE id = $1',
      [errandId]
    )
    const a = Number(r.rows[0].advance_amount)
    if (a !== 12000) throw new Error(`montant reconnu attendu 12000, obtenu ${a}`)
    if (!r.rows[0].advance_confirmed_at) throw new Error('date de confirmation absente')
    return 'reconnu 12000'
  })

  await pas('Le shopper commence les courses', async () => {
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2)', [errandId, 'shopping'])
  })

  await pas('Le shopper part en livraison', async () => {
    await c.query('SELECT public.errand_advance_status($1, $2)', [errandId, 'delivering'])
  })

  // --- Les articles, leurs manques et leurs remplacements -------------------
  await pas('La liste détaillée naît avec la course', async () => {
    await redevenirProprietaire()
    const r = await c.query(
      'SELECT count(*)::int n FROM public.errand_items WHERE errand_id = $1', [errandId]
    )
    if (r.rows[0].n === 0) throw new Error('aucun article détaillé')
    return `${r.rows[0].n} article(s)`
  })

  await pas('Le shopper propose un remplacement, le client tranche', async () => {
    await redevenirProprietaire()
    const article = (await c.query(
      'SELECT id FROM public.errand_items WHERE errand_id = $1 ORDER BY position LIMIT 1', [errandId]
    )).rows[0]
    if (!article) return 'aucun article à éprouver'

    await devenir(SHOPPER)
    await c.query(
      `SELECT public.errand_item_report($1, 'substitute', 'Produit équivalent', 1200, NULL)`,
      [article.id]
    )

    await devenir(CLIENT)
    await c.query('SELECT public.errand_item_decide($1, true)', [article.id])

    await redevenirProprietaire()
    const etat = (await c.query(
      'SELECT state::text, decided_at FROM public.errand_items WHERE id = $1', [article.id]
    )).rows[0]
    if (etat.state !== 'accepted') throw new Error('état ' + etat.state)
    if (!etat.decided_at) throw new Error("la décision n'est pas horodatée")
    return 'remplacement accepté et daté'
  })

  await refus(
    'Le client ne peut pas se déclarer shopper sur un article',
    async () => {
      const article = (await c.query(
        'SELECT id FROM public.errand_items WHERE errand_id = $1 ORDER BY position LIMIT 1', [errandId]
      )).rows[0]
      await devenir(CLIENT)
      return c.query(`SELECT public.errand_item_report($1, 'found')`, [article.id])
    }
  )

  await pas('Le shopper enregistre sa facture', async () => {
    // Les étapes précédentes ont pu changer d'acteur : on redevient
    // explicitement le shopper, sinon l'échec porterait sur l'identité et non
    // sur ce que l'on croit éprouver.
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_save_invoice($1, $2, $3, $4, $5)', [
      errandId, 14000, 0, 0, 'https://exemple.invalid/recu.jpg',
    ])
  })

  await pas("La facture deduit l'avance reconnue", async () => {
    await redevenirProprietaire()
    const r = await c.query(
      'SELECT total_amount, advance_amount, balance_due FROM public.errands WHERE id = $1',
      [errandId]
    )
    const total = Number(r.rows[0].total_amount)
    const avance = Number(r.rows[0].advance_amount)
    const reste = Number(r.rows[0].balance_due)
    if (avance !== 12000) throw new Error(`avance reconnue perdue : ${avance}`)
    if (reste !== total - avance) {
      throw new Error(`reste a regler ${reste}, attendu ${total - avance} (total ${total})`)
    }
    return `total ${total}, avance ${avance}, reste ${reste}`
  })

  await refus('Un mauvais code de remise est refusé', () =>
    c.query('SELECT public.errand_advance_status($1, $2, $3)', [errandId, 'delivered', '0000']))

  const code = await pas('Le client obtient son code de remise', async () => {
    await devenir(CLIENT)
    const r = await c.query('SELECT public.errand_handover_code($1) AS code', [errandId])
    if (!r.rows[0].code) throw new Error('aucun code rendu')
    return `code à ${String(r.rows[0].code).length} chiffres`
  })

  await pas('La remise a lieu avec le bon code', async () => {
    await redevenirProprietaire()
    const vrai = (await c.query('SELECT handover_code FROM public.errands WHERE id=$1', [errandId])).rows[0].handover_code
    await devenir(SHOPPER)
    await c.query('SELECT public.errand_advance_status($1, $2, $3)', [errandId, 'delivered', vrai])
  })

  // --- Clôture et argent ----------------------------------------------------
  await pas('Le client confirme le paiement (errand_confirm_payment)', async () => {
    await devenir(CLIENT)
    await c.query('SELECT public.errand_confirm_payment($1)', [errandId])
  })

  await pas('Le compte du shopper reflète le mode de règlement', async () => {
    await redevenirProprietaire()
    const e = (await c.query(
      'SELECT runner_payout, commission_amount, status FROM public.errands WHERE id=$1', [errandId]
    )).rows[0]
    const w = (await c.query(
      'SELECT pending_balance, commission_due FROM public.runner_wallets WHERE user_id=$1', [SHOPPER]
    )).rows[0]
    const mode = (await c.query(
      'SELECT settlement::text FROM public.commission_rules WHERE is_active LIMIT 1'
    )).rows[0].settlement

    if (e.status !== 'completed') throw new Error('statut ' + e.status)

    if (mode === 'direct') {
      // Le client a réglé le shopper en direct : la plateforme ne verse rien
      // et inscrit à son débit la commission qu'il lui doit.
      if (Number(w.pending_balance) !== 0) {
        throw new Error(`la plateforme porte ${w.pending_balance} au crédit alors qu'elle n'a rien encaissé`)
      }
      if (Math.abs(Number(w.commission_due) - Number(e.commission_amount)) > 0.01) {
        throw new Error(`commission due ${w.commission_due} != commission ${e.commission_amount}`)
      }
      return `mode direct, commission due ${w.commission_due}, aucun versement`
    }

    if (Math.abs(Number(w.pending_balance) - Number(e.runner_payout)) > 0.01) {
      throw new Error(`solde ${w.pending_balance} != gain ${e.runner_payout}`)
    }
    return `mode escrow, solde en attente ${w.pending_balance}`
  })

  await pas('Le journal du portefeuille est cohérent avec le compte', async () => {
    const mode = (await c.query(
      'SELECT settlement::text FROM public.commission_rules WHERE is_active LIMIT 1'
    )).rows[0].settlement
    const e = (await c.query(
      'SELECT runner_payout, commission_amount FROM public.errands WHERE id=$1', [errandId]
    )).rows[0]

    if (mode === 'direct') {
      const d = (await c.query(
        `SELECT COALESCE(-sum(amount),0) AS due FROM public.wallet_entries
         WHERE errand_id=$1 AND kind='commission_due'::wallet_entry_kind`, [errandId]
      )).rows[0]
      if (Math.abs(Number(d.due) - Number(e.commission_amount)) > 0.01) {
        throw new Error(`journal ${d.due} != commission ${e.commission_amount}`)
      }
      return `dette au journal ${d.due}, égale à la commission`
    }

    const j = (await c.query(
      'SELECT COALESCE(sum(amount),0) AS total FROM public.wallet_entries WHERE errand_id=$1', [errandId]
    )).rows[0]
    if (Math.abs(Number(j.total) - Number(e.runner_payout)) > 0.01) {
      throw new Error(`journal ${j.total} != gain crédité ${e.runner_payout}`)
    }
    return `somme du journal ${j.total}, égale au gain`
  })

  await pas('La confirmation est idempotente', async () => {
    await redevenirProprietaire()
    // On photographie le compte avant, puis on reconfirme : rien ne doit bouger.
    const avant = (await c.query(
      'SELECT pending_balance, commission_due FROM public.runner_wallets WHERE user_id=$1', [SHOPPER]
    )).rows[0]

    await devenir(CLIENT)
    await c.query('SELECT public.errand_confirm_payment($1)', [errandId])

    await redevenirProprietaire()
    const apres = (await c.query(
      'SELECT pending_balance, commission_due FROM public.runner_wallets WHERE user_id=$1', [SHOPPER]
    )).rows[0]

    if (Math.abs(Number(apres.pending_balance) - Number(avant.pending_balance)) > 0.01) {
      throw new Error(`le solde est passe de ${avant.pending_balance} a ${apres.pending_balance}`)
    }
    if (Math.abs(Number(apres.commission_due) - Number(avant.commission_due)) > 0.01) {
      throw new Error(`la commission due est passee de ${avant.commission_due} a ${apres.commission_due}`)
    }

    const lignes = (await c.query(
      'SELECT count(*)::int n FROM public.wallet_entries WHERE errand_id=$1', [errandId]
    )).rows[0].n
    return `compte inchange, ${lignes} ecriture(s) au journal`
  })

  await pas('La maturation ne verse jamais plus que le net', async () => {
    await redevenirProprietaire()
    const mode = (await c.query(
      'SELECT settlement::text FROM public.commission_rules WHERE is_active LIMIT 1'
    )).rows[0].settlement
    // En mode direct il n'y a rien à faire mûrir : la plateforme ne doit rien.
    if (mode === 'direct') return 'sans objet en mode direct'
    await c.query(`UPDATE public.wallet_entries SET matures_at = now() - interval '1 hour'
                   WHERE errand_id = $1 AND kind = 'earning'`, [errandId])
    await devenir(SHOPPER)
    const r = await c.query('SELECT public.wallet_release_matured_earnings() AS verse')
    await redevenirProprietaire()
    const e = (await c.query('SELECT runner_payout FROM public.errands WHERE id=$1', [errandId])).rows[0]
    const verse = Number(r.rows[0].verse)
    if (verse > Number(e.runner_payout) + 0.01) {
      throw new Error(`versé ${verse} alors que le gain net est ${e.runner_payout} : la commission fuit`)
    }
    return `versé ${verse}, gain net ${e.runner_payout}`
  })

  // --- Les notifications ----------------------------------------------------
  await pas('Le parcours a déposé des notifications aux deux parties', async () => {
    await redevenirProprietaire()
    const r = await c.query(
      `SELECT event, user_id FROM public.notification_outbox WHERE errand_id = $1`, [errandId]
    )
    if (r.rowCount === 0) throw new Error('aucune notification déposée')

    const destinataires = new Set(r.rows.map((x) => x.user_id))
    if (destinataires.size < 2) {
      throw new Error("un seul destinataire : le shopper ou le client n'est pas prévenu")
    }
    return `${r.rowCount} notification(s), ${destinataires.size} destinataires`
  })

  await devenir(CLIENT)
  await refus('Une course livrée ne peut plus être annulée', () =>
    c.query('SELECT public.errand_cancel($1, $2)', [errandId, 'je change d avis']))
} finally {
  await c.query('RESET ROLE')
  await c.query('ROLLBACK')
}

console.log('\n=== RESULTAT ===')
console.log('  etapes reussies :', ok.length)
console.log('  etapes en echec :', ko.length)
if (ko.length) {
  console.log('\n  ECHECS :')
  for (const e of ko) console.log('   - ' + e)
}
console.log('\n(transaction annulee : la base est intacte)')

await c.end()
process.exit(ko.length ? 1 : 0)
