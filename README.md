# Akwaba CI

Application de découverte touristique de la Côte d'Ivoire, et plateforme de
services **Akwaba Shopper** permettant de confier une course réelle à une
personne vérifiée.

Deux domaines cohabitent :

- **Découverte** : hôtels, restaurants, maquis, plages, lieux de culture, avec
  carte, itinéraires, favoris et demandes de réservation.
- **Akwaba Shopper** : un client publie une course (achats, marché, retrait de
  colis, démarche, mission personnalisée), des shoppers validés se positionnent,
  la mission est suivie de bout en bout jusqu'au règlement.

## Démarrage

Prérequis : Node 20 ou plus.

```bash
npm ci
cp .env.example .env   # renseigner les valeurs du projet Supabase
npm run dev            # http://localhost:8080
```

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Build de production |
| `npm run preview` | Sert le build localement |
| `npm run lint` | Analyse statique, doit rester sans erreur |
| `npm run typecheck` | Vérification des types, sans émission |
| `npm run test` | Tests unitaires (Vitest) |
| `npm run verify` | Enchaîne lint, types, tests et build |

Avant toute proposition de fusion, `npm run verify` doit passer. La même chaîne
tourne en intégration continue.

## Variables d'environnement

Elles sont décrites dans `.env.example`. Toutes portent le préfixe `VITE_` et
sont donc **exposées dans le bundle** : n'y placez jamais un secret serveur.

| Variable | Rôle |
|---|---|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_PROJECT_ID` | Identifiant du projet |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clé anon, publique par conception, protégée par les politiques RLS |

Les secrets serveur (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`,
`BOOTSTRAP_ADMIN_TOKEN`) ne vivent que dans les secrets Supabase et ne sont lus
que par les fonctions edge.

## Architecture

```
src/
  modules/            Domaines métier
    errands/          Courses : domaine, tarification, interface
    places/           Lieux : domaine, adaptateur Supabase, hooks, interface
    favorites/        Favoris : adaptateurs local et distant
    leads/            Demandes de réservation
  pages/              Écrans, organisés par univers
  shared/             Coquille applicative, navigation, gardes de routes
  integrations/       Client Supabase et types générés
supabase/
  migrations/         Schéma versionné
  functions/          Fonctions edge (Deno)
scripts/              Outils, dont la génération des données de démarrage
docs/audit/           Rapport d'audit de l'état courant
```

Chaque domaine suit la même découpe : `domain` pour les types et les règles
pures, `infrastructure` pour les accès aux données, `application` pour les
hooks, `ui` pour les composants.

### Principe directeur : l'argent et les états relèvent du serveur

Le client ne modifie jamais directement un montant, un statut de course, une
affectation ou un solde. Ces opérations passent par des fonctions PostgreSQL en
`SECURITY DEFINER`, qui vérifient l'acteur, contrôlent la transition et
recalculent les montants à partir du barème stocké dans `commission_rules`.

| Fonction | Rôle |
|---|---|
| `errand_accept_offer` | Le client accepte une offre, les montants sont recalculés |
| `errand_advance_status` | Progression du shopper, code de remise exigé à la livraison |
| `errand_save_invoice` | Facture réelle, montants recalculés côté serveur |
| `errand_confirm_payment` | Clôture, crédit du portefeuille, idempotente |
| `errand_cancel`, `errand_open_dispute` | Annulation et litige, gel des gains |
| `errand_rate_runner` | Notation, moyenne recalculée |
| `errand_create` | Publication d'une course, devis et code de remise calculés par le serveur |
| `errand_attach_proof` | Dépôt d'un reçu ou d'une preuve d'avance |
| `errand_declare_advance` | Le client déclare le budget transféré, le reste à payer est recalculé |
| `errand_runner_payout_account` | Compte de réception du shopper, visible du seul client concerné |
| `errand_resolve_dispute` | Arbitrage d'un litige par un modérateur |
| `payout_request_create` | Retrait, solde vérifié et débité atomiquement |
| `payout_request_settle` | Traitement administrateur, un refus recrédite |
| `wallet_release_matured_earnings` | Gains arrivés à maturité, en solde disponible |

Des déclencheurs de garde rejettent toute écriture directe des colonnes
sensibles sur `errands` et `runner_profiles`.

### Modèle de commission

Une seule source de vérité : la table `commission_rules`, versionnée. La base
commissionnable est le **frais de service seul**. L'argent des achats revient
intégralement au marchand et n'est jamais commissionné.

## Application installable

L'application s'installe sur l'écran d'accueil et reste utilisable sur un réseau
défaillant.

| Élément | Rôle |
|---|---|
| `public/manifest.webmanifest` | Nom, couleurs, raccourcis, icônes |
| `public/sw.js` | Cache des ressources, repli hors ligne, jamais de cache des données |
| `scripts/generate-icons.mjs` | Génère les icônes depuis la palette de marque |
| `src/shared/pwa/` | Enregistrement, invite d'installation, bandeau hors ligne |

À chaque livraison qui modifie les ressources, incrémenter la constante
`VERSION` de `public/sw.js`, sinon les navigateurs conserveront l'ancienne
version en cache.

## Zones de service

Les villes et quartiers vivent dans `service_cities` et `service_zones`. Ouvrir
une ville aux courses se fait en base, en activant `errands_enabled` : aucune
livraison de code n'est nécessaire. Les courses ne sont proposées que là où un
réseau de shoppers existe.

## Rôles

| Rôle | Périmètre |
|---|---|
| `user` | Client : découverte, favoris, demandes, création de courses |
| `partner` | Établissement : ses fiches et ses demandes dans `/admin` |
| `moderator` | Modération des fiches et validation des shoppers |
| `admin` | Tout le back-office, dont le traitement des retraits |

Le premier administrateur est créé une seule fois via `/admin/bootstrap`,
protégé par le secret `BOOTSTRAP_ADMIN_TOKEN`.

## Stockage

| Bucket | Visibilité | Contenu |
|---|---|---|
| `place-images` | Public | Photographies déposées par les partenaires |
| `identity-docs` | Privé | Pièces d'identité des shoppers |
| `errand-proofs` | Privé | Reçus d'achat et preuves d'avance |

Les documents privés ne sont jamais servis par une URL publique : la lecture
passe par une URL signée à durée courte.

## Données de démarrage

Le catalogue initial est généré depuis la source éditoriale, ce qui évite toute
divergence entre le contenu et la base :

```bash
node scripts/generate-place-seed.mjs supabase/migrations/<horodatage>_seed.sql
```

## Branches et livraison

| Branche | Rôle |
|---|---|
| `main` | Production |
| `develop` | Intégration |
| `feat/*`, `fix/*`, `docs/*`, `chore/*` | Travaux en cours |

Le travail part de `develop` et y revient par proposition de fusion, une fois
l'intégration continue au vert. `main` reçoit une publication revue depuis
`develop`. Messages de commit au format Conventional Commits, en anglais.

## Hébergement

`vercel.json` et `public/_redirects` portent le repli monopage, indispensable
pour qu'un lien de fiche partagé par messagerie ouvre bien l'application, ainsi
que les en-têtes de cache et de sécurité.

## État du produit

Un audit complet de l'état courant est disponible dans
[docs/audit/2026-08-akwaba-current-state.md](docs/audit/2026-08-akwaba-current-state.md) :
cartographie technique et fonctionnelle, audit du schéma et de la sécurité,
backlog priorisé et décisions restant à arbitrer.

Décisions produit encore ouvertes, à trancher avant une mise en service :
l'intégration d'un agrégateur de paiement mobile money, la politique de
remboursement et de litige, les modalités de vérification des shoppers, et les
villes couvertes au lancement.
