# Akwaba CI, audit de l'état courant (Phase 0)

| Champ | Valeur |
|---|---|
| Dépôt | `github.com/Jean-Christ1/akwaba-ci` |
| Branche auditée | `develop` au commit `510af45` |
| Date de l'audit | 13 août 2026 |
| Périmètre | Code applicatif, schéma Supabase, fonctions edge, configuration, dépôt et livraison |
| Nature | Audit en lecture seule. Aucun fichier applicatif, aucune migration et aucune donnée n'ont été modifiés. |

## 1. Résumé exécutif

Akwaba CI est une application Lovable (Vite 5, React 18, TypeScript 5.8, shadcn/Radix, Tailwind, Supabase) hébergée sur GitHub. Toute la valeur applicative vit sur `develop` ; `main` est figée 126 commits en arrière, sur le seul document stratégique initial.

Le produit se scinde en deux domaines de maturité très inégale.

Le domaine **Découverte** (accueil, explorateur, fiche lieu, carte, favoris, parcours) est une maquette alimentée à 100 pour cent par un tableau codé en dur, `src/modules/places/infrastructure/data.ts`, avec 7 lieux `p-001` à `p-007`. Il est totalement déconnecté de la table Supabase `places`, qui existe pourtant, dispose d'une lecture publique des lieux publiés et est alimentée par un vrai flux partenaire (inscription puis modération). Conséquence directe : une fiche partenaire approuvée n'apparaît jamais côté client, et le bouton de réservation envoie un identifiant non-UUID dans une colonne UUID à clé étrangère, ce qui casse systématiquement l'insertion du lead.

Le domaine **Akwaba Courses / Shopper**, pilier central, est en revanche réellement câblé sur Supabase avec RLS, temps réel et fonctions edge. Création de course, devis, offres shopper, acceptation, suivi et messagerie fonctionnent de bout en bout sur des données réelles. Ce n'est pas une maquette.

La faille majeure est la **couche monétaire**. La confirmation de paiement bascule un simple statut côté client, sans transaction, sans vérification du code de remise et sans autorité serveur. Les politiques RLS de mise à jour ne posent aucune garde de colonne : montants, commission et `payment_status` sont librement modifiables par un participant. C'est une atteinte à l'intégrité financière, classée P0. Le portefeuille shopper (`runner_wallets`, `wallet_entries`) n'est jamais crédité par aucun trigger, fonction ou fonction edge, ce qui rend le retrait structurellement impossible. Le workflow de preuves promis à l'utilisateur (capture d'avance, reçu, code de remise à 4 chiffres) n'est câblé nulle part.

Le moteur de prix comporte trois sources de vérité contradictoires pour la commission (0,15 dans `pricing.ts`, 0,10 dans `domain.ts`, défaut SQL 0,10) avec des bases de calcul divergentes, et `acceptOffer` ne recalcule pas les montants après changement de prix.

Côté sécurité Supabase, la table `runner_profiles` laisse un utilisateur s'auto-valider shopper (colonne `status` non contrainte à l'INSERT comme à l'UPDATE), ce qui contourne le contrôle KYC. Elle expose aussi téléphone, WhatsApp et document d'identité de tout shopper approuvé à n'importe quel utilisateur connecté, faute de restriction de colonne et de bucket privé.

Le socle technique est fragile mais non cassé : le build passe (bundle monolithique de 1,93 Mo, 522 Ko gzip, sans découpage), `tsc` passe mais en mode non strict intégral, ESLint remonte 76 erreurs, deux fichiers de verrouillage de dépendances coexistent, le fichier `.env` est suivi par git hors `.gitignore` (clé anon publique uniquement, impact limité), et il n'existe aucune intégration continue.

**Un point décisif pour la conduite du projet** : l'accès à la base réelle a permis de vérifier que **le projet Supabase est vide**. Un seul compte, déjà administrateur, aucun lieu, aucune course, aucun shopper, aucun mouvement financier. Les défauts P0 sont donc **structurellement graves mais opérationnellement sans victime à ce jour**. Cela ouvre une fenêtre favorable : poser les gardes de colonne, les clés étrangères et les contraintes de montants sur une base vide ne coûte aucune reprise de données, alors que chaque semaine d'exploitation rendra ces mêmes migrations plus lourdes et plus risquées.

**En synthèse** : l'ossature Shopper est prometteuse et majoritairement réelle, mais la monétisation, les garanties de confiance et la boucle Découverte sont soit des façades, soit des mécaniques exposées sans autorité serveur. Cela interdit toute mise en production avant remédiation des constats P0 et P1, remédiation qu'il est aujourd'hui peu coûteux d'engager.

## 2. Méthode et traçabilité des preuves

L'audit a été conduit par huit analyses parallèles indépendantes, chacune sur une dimension du périmètre, suivies d'une phase de vérification adversariale et d'une synthèse consolidée.

| Étape | Volume | Détail |
|---|---|---|
| Analyses dimensionnelles | 8 | Technique, fonctionnel client, fonctionnel Shopper, schéma Supabase, sécurité Supabase, architecture front, câblage réel, dépôt et livraison |
| Constats bruts | 73 | Répartis P0 : 5, P1 : 23, P2 : 28, P3 : 17 |
| Vérifications adversariales | 10 | Chaque constat critique soumis à un examinateur chargé de le réfuter |
| Verdicts | 7 confirmés, 3 nuancés, 0 réfuté | Une sévérité relevée en P0, quatre abaissées |
| Constats consolidés | 43 | Après déduplication inter-dimensions |
| Confrontation à la base réelle | 6 introspections | Politiques, triggers, clés étrangères, buckets, migrations appliquées, volumes |

Chaque constat cite un chemin de fichier et un numéro de ligne, ou un extrait exact. Les constats de sécurité les plus lourds ont ensuite été **confrontés à l'état réel du projet Supabase** (section 5.8), ce qui les fait passer du statut de déduction à celui de fait vérifié. Les commandes exécutées et leurs résultats sont consignés en section 9.

## 3. Cartographie technique (5.1)

### 3.1 Pile technique et outillage

| Élément | Valeur | Preuve |
|---|---|---|
| Build | Vite 5.4.19 avec `@vitejs/plugin-react-swc` 3.11 | `package.json:15-90` |
| Interface | React 18.3.1, shadcn/ui sur Radix, Tailwind 3.4.17 | `package.json`, `components.json` |
| Langage | TypeScript 5.8.3 | `package.json` |
| Données | `@supabase/supabase-js` 2.105.3, TanStack Query 5.83 | `package.json:44` |
| Navigation | `react-router-dom` 6.30.1 | `package.json` |
| Formulaires | `react-hook-form` 7.61 avec Zod 3.25 | `package.json` |
| Cartographie | `maplibre-gl` 5.24, `react-map-gl` 8.1 | `package.json` |
| Tests | Vitest 3.2.4, Testing Library, jsdom | `vitest.config.ts` |

Scripts disponibles : `dev`, `build`, `build:dev`, `lint`, `preview`, `test`, `test:watch`. **Aucun script de vérification de types ni de formatage** (`package.json:6-14`). Le nom du paquet est resté générique, `vite_react_shadcn_ts`, en version `0.0.0`.

### 3.2 Gestionnaire de paquets, recommandation

`bun.lockb` (272 Ko) et `package-lock.json` (325 Ko) sont **tous deux suivis par git**. Les deux résolveurs peuvent diverger sur les versions transitives, ce qui rend les constructions locales, Lovable et CI non déterministes. La dérive est déjà visible : `package-lock.json` a été réécrit par l'installation npm de cette session.

Recommandation, avec plan non destructif : Lovable utilise bun, et le dépôt est piloté par Lovable. Le choix le plus cohérent est de **conserver `bun.lockb`** et de retirer `package-lock.json` du suivi via `git rm --cached package-lock.json`, ce qui ne supprime aucun fichier local. Si l'équipe préfère la standardisation npm, l'opération symétrique s'applique à `bun.lockb`. Dans les deux cas, le choix doit être documenté dans le README et appliqué à l'identique en intégration continue. Cette décision est ouverte, elle figure en section 7.

### 3.3 Routes, pages et navigation

Le routeur déclare 27 pages. Toutes les routes applicatives sont montées sous une coquille unique `AppShell`, **sans aucune protection par rôle au niveau du routeur**, y compris `/admin`, `/admin/shoppers`, `/admin/places/:id` et `/admin/bootstrap` (`src/App.tsx:51-73`).

| Groupe | Routes |
|---|---|
| Hors coquille | `/onboarding`, `/auth`, `/reset-password` |
| Découverte | `/`, `/explorer`, `/lieu/:slug`, `/carte`, `/parcours`, `/parcours/:slug`, `/favoris` |
| Compte | `/profil`, `/partner/signup` |
| Services | `/services`, `/itineraire` |
| Courses | `/courses`, `/courses/nouvelle`, `/courses/comment-ca-marche`, `/courses/portefeuille`, `/courses/devenir-shopper`, `/courses/shopper`, `/courses/:id` |
| Administration | `/admin`, `/admin/bootstrap`, `/admin/shoppers`, `/admin/places/:id` |

La coquille fournit un en-tête de bureau (`DesktopHeader`), une barre d'onglets mobile (`MobileTabBar`) et un sélecteur de service (`ServiceSwitcher`). Deux systèmes de notification sont montés simultanément, Radix Toaster et Sonner (`src/App.tsx:44-45`).

### 3.4 Architecture front

Le découpage par domaine (`domain` / `application` / `infrastructure` / `ui`) est amorcé mais **appliqué de façon incohérente** :

- `places` possède `domain`, `infrastructure` et `ui`, mais pas de couche `application` ;
- `favorites` possède `application` et `infrastructure`, mais ni `domain` ni `ui` ;
- `errands`, le module le plus critique, ne contient que `domain.ts` et `pricing.ts`, sans aucune couche d'infrastructure.

Conséquence : **tous les accès Supabase sont écrits en ligne dans les composants de page**, sans couche de dépôt centralisée (`ErrandDetailPage.tsx:102,113-114,184,195,213,243`, `RunnerDashboardPage.tsx:51-52,72`, `WalletPage.tsx:74-77,97,113,127`). Les interfaces `Errand`, `Offer` et `Msg` sont redéclarées dans plusieurs pages.

`QueryClientProvider` est monté mais **aucun `useQuery` ni `useMutation` n'existe dans le code**. Le chargement se fait partout à la main via `useEffect` et `useState`. Aggravant : les lectures ne récupèrent que `data` et ignorent l'erreur, si bien qu'un échec réseau ou un refus RLS s'affiche comme un état vide légitime plutôt que comme une erreur (`AuthContext.tsx:29`, `RunnerDashboardPage.tsx:45-53`, `MyErrandsPage.tsx:32-40`).

### 3.5 Dette technique mesurée

| Indicateur | Mesure | Preuve |
|---|---|---|
| Mode strict TypeScript | Entièrement désactivé | `tsconfig.app.json:19-23`, `tsconfig.json:8-13` |
| Erreurs ESLint | 76 erreurs, 10 avertissements | `npm run lint` |
| Dont `no-explicit-any` | 71 (41 en production, 28 dans `AdminPage.tsx`) | agrégation ESLint |
| Détection de code mort | Neutralisée (`no-unused-vars` à `off`) | `eslint.config.js:23` |
| Appels `console.*` en production | 6 | `AdminPage.tsx:118,133,256`, `NotFound.tsx:8`, `tabAnalytics.ts:14,32` |
| TODO / FIXME | 1, le placeholder du README | `README.md:3` |
| Fichier le plus volumineux | `types.ts` 1092 lignes (généré), puis `AdminPage.tsx` 774 lignes | `wc -l` |
| Bundle de production | 1 928 284 octets en un seul chunk JS | `dist/assets/index-*.js` |

`tsc --noEmit` se termine en succès, mais **cette vérification est faible** : `strict`, `strictNullChecks` et `noImplicitAny` sont tous à `false`, sur un code qui manipule 64 appels `.from()` répartis sur 18 fichiers, dont chaque réponse Supabase a la forme `{ data: T | null }`.

`AdminPage.tsx` atteint 774 lignes, au-delà du plafond dur de 500 lignes et proche du maximum absolu de 750 de la politique de seuils. Il concentre tableau de bord, fiches, demandes, messages, modération et gestion des utilisateurs dans un composant unique.

### 3.6 Découpage du bundle

Le build produit **un chunk JS unique de 1,93 Mo** (522 Ko après compression gzip mesurée), plus 152 Ko de CSS. Les 27 pages sont importées statiquement dans `App.tsx:9-33`, sans `React.lazy` ni import dynamique, et `vite.config.ts` ne définit aucun `manualChunks`. `maplibre-gl` est embarqué dans le chunk principal alors qu'il ne sert que sur `/carte` et `/itineraire`.

La vérification adversariale a nuancé ce constat : le poids transporté sur le réseau est de 522 Ko compressés, non 1,93 Mo. Le seuil de 500 Ko est un avertissement Vite, pas une erreur. La sévérité retenue est donc P2 et non P1.

## 4. Cartographie fonctionnelle (5.2)

### 4.1 Tableau de classification

État : 1 fonctionnel de bout en bout, 2 partiellement implémenté, 3 maquette ou données simulées, 4 absent, 5 défectueux ou incohérent.

| Fonctionnalité | État | Écrans | Preuve |
|---|---|---|---|
| Authentification (inscription, connexion, réinitialisation) | 1 | AuthPage, ResetPasswordPage, AuthContext | `AuthContext.tsx:34,44` ; `AuthPage.tsx:37,49,55` ; trigger `handle_new_user` |
| Profil utilisateur | 1 | ProfilePage | `ProfilePage.tsx:29,32,35,57` |
| Inscription partenaire | 1 | PartnerSignupPage | `register-partner/index.ts:55,91` |
| Modération admin des lieux | 1 | AdminPage, moderate-place | `moderate-place/index.ts:78-88` |
| Validation des shoppers (back-office) | 1 | ShoppersPage, RunnerSignupPage | `ShoppersPage.tsx:43-48` (mais contournable, voir P0-2) |
| Création de course Shopper | 1 | NewErrandPage | `NewErrandPage.tsx:105-137` |
| Suivi de course et messagerie temps réel | 1 | ErrandDetailPage | `ErrandDetailPage.tsx:136-159,211-217` |
| Estimation de prix et devis | 2 | NewErrandPage, pricing.ts | `pricing.ts:112-145` ; distance et durée saisies libres |
| Affectation runner | 2 | RunnerDashboardPage, ErrandDetailPage | `RunnerDashboardPage.tsx:69-84` ; montants non recalculés |
| Carte MapLibre | 2 | MapPage | Tuiles OSM réelles, marqueurs statiques `MapPage.tsx:45` |
| Favoris | 2 | FavoritesPage | `favorites-local.ts:4,26-33`, localStorage seul |
| Itinéraire interne OSRM | 2 | RoutePage | Fonctionne, mais route orpheline `App.tsx:65` |
| Machine à états de course | 2 | ErrandDetailPage, domain.ts | 6 états atteignables sur 9 |
| Découverte des lieux | 3 | HomePage, ExplorerPage, PlaceDetailPage | `data.ts:55,355` ; jamais `from('places')` côté public |
| Recherche et filtres | 3 | ExplorerPage | `ExplorerPage.tsx:34-48`, filtrage client sur tableau statique |
| Parcours curatés | 3 | ItineraryPages | `data.ts:293` |
| Réservation depuis une fiche | 5 | PlaceDetailPage, LeadRequestForm | `place_id` non-UUID en colonne UUID, échec 22P02 systématique |
| Confirmation de paiement | 5 | ErrandDetailPage | `ErrandDetailPage.tsx:236-251`, déclaratif sans autorité serveur |
| Portefeuille shopper | 5 | WalletPage | Jamais crédité, `20260813003029:150-160` |
| Retrait des gains | 5 | WalletPage, AdminPage | Solde jamais débité, aucun écran admin |
| Statistiques de confiance runner | 4 | ErrandDetailPage | Champs lus, jamais incrémentés |
| Workflow de preuves | 4 | NewErrandPage, ErrandDetailPage | `handover_code` généré jamais affiché ni vérifié |
| Paiement mobile money | 4 | néant | Aucune passerelle |
| Traçabilité financière (`errand_payments`) | 4 | néant | Table définie, jamais lue ni écrite |
| Intégration continue | 4 | néant | Aucun `.github/workflows` |

### 4.2 Parcours client actuel

Onboarding, authentification, profil et inscription partenaire sont branchés au vrai Supabase et fonctionnent. À l'inverse, **toute la boucle de découverte est figée dans le code**. Les six écrans de navigation importent `data.ts` et ne requêtent jamais la table `places` (`HomePage.tsx:4`, `ExplorerPage.tsx:4`, `PlaceDetailPage.tsx:14`, `MapPage.tsx:5`, `FavoritesPage.tsx:4`, `ItineraryPages.tsx:3`).

Ruptures relevées dans ce parcours :

- Le texte marketing présente le contenu comme vivant, « Chaque lieu est visité, contrôlé, mis à jour » (`HomePage.tsx:91`), alors qu'il est figé dans le code.
- `getPlaceBySlug` ne cherche que dans le tableau statique : une fiche partenaire publiée n'est pas résoluble via `/lieu/:slug` (`data.ts:355-357`).
- L'accueil propose des catégories Plages et Sorties alors qu'aucun lieu statique n'a ces types, donc le clic aboutit systématiquement à un écran vide. Le type `nightlife` n'est même pas dans la liste de filtres de l'explorateur.
- Le bouton Connexion du bandeau de bureau pointe vers `/profil` au lieu de `/auth`, ce qui impose deux clics (`DesktopHeader.tsx:49-54`).
- `RoutePage` implémente un vrai calcul d'itinéraire OSRM, mais `/itineraire` n'est atteignable par aucun lien. Le bouton Itinéraire de la fiche lieu ouvre Google Maps en externe.

### 4.3 Parcours Shopper actuel

C'est le domaine le plus abouti. Le formulaire de création couvre cinq sections et insère réellement dans `errands` avec `status='open'`. Les neuf types de course sont adossés à l'énumération SQL `errand_category` et tous sélectionnables : la cible produit sur ce point est atteinte.

Le moteur de devis `quoteErrand` est déterministe et lisible, avec séparation explicite entre l'argent des achats et les frais de service (`pricing.ts:1-6`). Sa formule reste toutefois **entièrement codée en dur côté front**, sans barème versionné et sans validation serveur, ce qui est contraire à la cible de tarification.

Les écarts par rapport à la cible :

| Cible | État | Écart |
|---|---|---|
| Types de course | Atteinte | Neuf catégories réelles adossées à l'énumération SQL |
| Machine à états | Partielle | 9 états déclarés, 6 atteignables. `cancelled`, `disputed` et `draft` inaccessibles depuis l'interface |
| Tarification transparente | Partielle | Décomposition affichée, mais barème front non versionné et commission incohérente |
| Paiement, portefeuille, commission | Très incomplète | Confirmation déclarative, portefeuille jamais crédité, aucune passerelle |
| Preuves et fin de course | Absente | Code de remise généré mais jamais affiché ni vérifié, reçu et capture d'avance jamais écrits |

### 4.4 Parcours runner actuel

Inscription réelle (`runner_profiles` en `pending`), validation manuelle par un modérateur via un back-office fonctionnel, tableau de bord avec flux des courses ouvertes en temps réel, soumission d'offres réelle sur `errand_offers`. L'acceptation d'offre met à jour `runner_id`, `status` et `service_fee`, rejette les autres offres et journalise l'événement.

Les points de rupture concernent l'aval : les statistiques de confiance (`jobs_completed`, `rating`) sont affichées mais jamais incrémentées, le portefeuille reste à zéro à vie, et le retrait est impossible.

### 4.5 Écarts entre contenu affiché et comportement réel

C'est la catégorie la plus sensible pour la confiance produit.

| Promesse affichée | Réalité du code |
|---|---|
| « Chaque lieu est visité, contrôlé, mis à jour » | Tableau figé de 7 lieux dans `data.ts` |
| « Accédez à vos favoris et demandes » sur l'écran d'authentification | Favoris en `localStorage` seul, jamais liés au compte |
| Capture d'avance déposée, reçu photographié obligatoire, code de remise à 4 chiffres bloquant (`HowItWorksPage.tsx:44-46,171-176`) | Aucun de ces trois mécanismes n'est câblé |
| Course « Terminée et payée » | Simple bascule de statut, aucun mouvement d'argent, aucune preuve |
| Soldes et gains du portefeuille shopper | Toujours zéro, jamais crédités |
| Notation après chaque mission | Aucune interface de notation, agrégats figés à zéro |

## 5. Audit Supabase (5.3)

### 5.1 Projet et accessibilité

Le projet Supabase réellement utilisé est identifié par `VITE_SUPABASE_PROJECT_ID` dans `.env` et par `supabase/config.toml:1`.

**L'audit a accédé au projet distant en lecture seule** (région eu-west-3, connexion PostgreSQL directe). L'identité du projet a été vérifiée par recoupement : le `project_id`, l'URL et la clé anon du coffre de secrets correspondent exactement à ceux du `.env` du dépôt, et le décodage des JWT confirme les rôles `anon` et `service_role` sur la même référence de projet.

Les conclusions de cette section ne reposent donc pas seulement sur les migrations versionnées : **elles ont été confrontées à l'état réel de la base**, voir la vérification en section 5.8. Le jeton d'accès de l'API Management présent dans le coffre est en revanche invalide, il retourne 401 et porte une note indiquant qu'il provient d'un autre projet. Les advisors de sécurité et de performance de Supabase n'ont donc **pas** pu être exécutés ; leur contenu reste à obtenir.

### 5.2 Schéma

16 tables, 18 énumérations, 6 fonctions SQL, 10 triggers. La cohérence entre le SQL, les types TypeScript générés et les références `.from()` du code est **parfaite** : toutes les tables appelées existent, aucune référence morte, aucun `.rpc()` utilisé.

| Domaine | Tables |
|---|---|
| Comptes et rôles | `profiles`, `user_roles` |
| Tourisme | `places`, `leads`, `place_moderation_events` |
| Shopper | `runner_profiles`, `errands`, `errand_offers`, `errand_messages`, `errand_events` |
| Finance | `runner_payout_accounts`, `runner_wallets`, `wallet_entries`, `payout_requests`, `errand_payments` |
| Croissance | `referrals` |

Énumérations : `app_role`, `place_type`, `place_status`, `lead_status`, `lead_kind`, `moderation_action`, `errand_status`, `errand_category`, `offer_status`, `runner_status`, `pay_method`, `pay_status`, `fund_mode`, `dropoff_mode`, `payout_status`, `wallet_entry_kind`, `errand_payment_kind`, `momo_provider`.

Fonctions : `update_updated_at_column`, `handle_new_user` (SECURITY DEFINER, crée profil et rôle à l'inscription), `has_role`, `is_approved_runner`, `is_errand_participant`, `ensure_runner_wallet`.

Temps réel activé sur `places`, `errands`, `errand_messages` et `errand_offers` avec `REPLICA IDENTITY FULL`.

### 5.3 Correspondance avec le modèle cible

| Table cible | État | Correspondance |
|---|---|---|
| `shopper_profiles` | Présente | `runner_profiles` |
| `errand_quotes` | Présente | `errand_offers` |
| `wallets` | Présente | `runner_wallets` |
| `ledger_entries` | Présente | `wallet_entries` |
| `errand_status_history` | Présente | `errand_events` |
| `service_areas`, `cities`, `zones` | Absentes | Texte libre `city` et `zone`, plus un jsonb côté runner |
| `errand_stops` | Absente | Course mono-adresse, une seule `delivery_address` |
| `disputes` | Absente | L'énumération contient `disputed`, sans table de litige |
| `payment_intents`, `payment_authorizations` | Absentes | `errand_payments` est une table de preuve manuelle |
| `pricing_rules`, `commission_rules` | Absentes | Barème codé en dur côté front |
| `refunds`, `payouts` | Partielles | `payout_requests` seul, pas d'exécution |
| `audit_logs` générique | Absente | Seulement `place_moderation_events` et `errand_events` |

### 5.4 Sécurité, points positifs vérifiés

Il faut le souligner, plusieurs fondations sont correctes :

- **RLS activée sur les 16 tables** du schéma public, sans exception.
- Les fonctions SECURITY DEFINER sont verrouillées : `REVOKE` de PUBLIC et anon, puis `GRANT` ciblé.
- Les `GRANT ALL` ne visent que `service_role`, jamais `anon` ni `authenticated`.
- Les tables de portefeuille n'accordent qu'un `GRANT SELECT` à `authenticated` : les soldes ne sont mutables que par `service_role`.
- **Aucune clé `service_role` n'est codée en dur.** Les fonctions edge la lisent via `Deno.env.get()`, côté serveur, ce qui est le comportement correct.
- Les fonctions edge `moderate-place` et `test-email` vérifient le JWT via `getClaims`, puis re-vérifient le rôle en `service_role` avant toute action.

### 5.5 Failles de sécurité

| Sévérité | Faille | Preuve |
|---|---|---|
| **P0** | **Auto-validation shopper.** Les politiques INSERT et UPDATE de `runner_profiles` ne contraignent pas la colonne `status`. Le USING de l'UPDATE est réutilisé comme WITH CHECK implicite, donc rien n'interdit à un utilisateur de passer sa propre ligne à `status='approved'`. `is_approved_runner()` renvoie alors vrai, ce qui ouvre la lecture de toutes les courses et la soumission d'offres. Le contrôle KYC d'une place de marché où circulent avances et espèces est contourné. | `20260812234751:40-43`, fonction lignes 33-36, usage ligne 88 |
| **P0** | **Intégrité du paiement.** Les politiques UPDATE de `errands`, `errand_offers` et `errand_payments` n'ont aucune garde de colonne. Un participant modifie librement `items_total`, `service_fee`, `commission_amount`, `total_amount`, puis `payment_status='paid'` et `status='completed'`. Aucune fonction edge ni trigger ne recalcule ou ne vérifie ces valeurs. | `20260812234751:93-94,131-136` ; `20260813003029:129-130` ; `ErrandDetailPage.tsx:219-241` |
| **P1** | **Fuite inter-utilisateur.** La politique SELECT de `runner_profiles` autorise la lecture de la ligne complète dès `status='approved'`. Or la table contient `phone`, `whatsapp` et `id_doc_url`. Tout utilisateur authentifié peut récupérer coordonnées et document d'identité de tous les shoppers validés. La RLS ne protège pas au niveau colonne. | `20260812234751:38-39`, colonne `id_doc_url` ligne 20 |
| **P1** | **Aucun bucket privé.** `id_doc_url`, `advance_proof_url`, `proof_url` et `receipt_url` sont prévues pour des documents sensibles, mais le schéma ne crée que `place-images` en `public=true`. Tout document qui y serait déposé deviendrait accessible mondialement par son URL. | `20260507194643:225` ; upload unique `PartnerSignupPage.tsx:73-75` |
| **P1** | **Retrait sans contrôle serveur.** La politique INSERT de `payout_requests` ne vérifie que `amount > 0`, sans comparaison au solde. Le plafonnement est purement côté client, donc contournable par appel direct. Aucun trigger ne débite le portefeuille. | `20260813003029:101-102` ; `WalletPage.tsx:118-137` |
| P2 | Adresse de livraison exacte, latitude, longitude et notes de toute course ouverte exposées à l'ensemble des shoppers approuvés avant mise en relation. | `20260812234751:84-90` |
| P2 | `referrals.credits` et `invited_count` librement insérables ; `commission_rate` et `commission_amount` non bornés à l'INSERT de `errands`. | `20260813003029:146-147` ; `20260812234751:91-92` |
| P2 | Table `leads` insertable par un visiteur anonyme, avec données personnelles et sans limitation de débit ni captcha. | `20260507194719:9-17` |
| P3 | Les fonctions edge renvoient le message d'erreur brut au client, ce qui divulgue des détails techniques. | `moderate-place/index.ts:168`, `register-partner/index.ts:98` |
| P3 | `Access-Control-Allow-Origin: *` sur toutes les fonctions edge, notamment `submit-lead` qui n'exige pas de JWT. | `moderate-place/index.ts:3-6` |

### 5.6 Intégrité et performance du schéma

**Clés étrangères manquantes.** Plusieurs colonnes propriétaires sont `uuid NOT NULL` sans clause `REFERENCES` : `runner_wallets.user_id`, `wallet_entries.user_id`, `runner_payout_accounts.user_id`, `payout_requests.user_id`, `referrals.user_id`, `errand_payments.payer_id` et `confirmed_by`. De même pour `place_moderation_events.place_id` et `moderator_id`, confirmé par un tableau `Relationships: []` dans les types générés. Aucune intégrité référentielle, aucune cascade : des lignes financières orphelines subsisteront à la suppression d'un compte.

**Index.** Présents sur `places`, `leads`, `errands` et `errand_messages`. Absents sur `wallet_entries(user_id)`, `payout_requests(user_id)` et `errand_payments(errand_id)`, qui sont pourtant les colonnes de filtrage des écrans financiers.

**Contraintes.** Les dix colonnes monétaires de `errands` sont de type `numeric` sans précision ni contrainte de positivité. `errands.lat` et `lng` sont `numeric` sans précision, alors que `places.lat/lng` sont correctement en `NUMERIC(9,6)`. `errands.rating` est un `smallint` sans borne, alors que `places.standing` porte un `CHECK BETWEEN 1 AND 5`.

### 5.7 Le cœur du problème monétaire

Trois défauts se composent pour rendre toute la chaîne financière non fiable.

**Premièrement, aucune autorité serveur.** `confirmPayment` (`ErrandDetailPage.tsx:236-251`) exécute uniquement une mise à jour de `payment_status` et `status`, suivie d'un événement d'audit et d'un message de succès. Aucune transaction, aucune vérification du code de remise, aucune écriture dans `errand_payments`, aucun crédit de portefeuille, aucun incrément de statistiques. Le seul trigger sur `errands` est un `BEFORE UPDATE` qui met à jour l'horodatage.

**Deuxièmement, le portefeuille n'est jamais crédité.** Les seules écritures sur `runner_wallets` dans tout le dépôt sont la fonction `ensure_runner_wallet()` et son remplissage initial, qui insèrent un portefeuille à zéro. Une recherche exhaustive sur les migrations, les cinq fonctions edge et le code client ne retourne **aucune** insertion dans `wallet_entries` ni aucune mise à jour de solde. Conséquence en cascade : `available_balance` vaut toujours zéro, donc `requestPayout` rejette systématiquement toute demande supérieure ou égale au minimum de 2000 FCFA. Le retrait est structurellement impossible.

**Troisièmement, la commission est incohérente.** Trois déclarations, deux valeurs :

| Source | Valeur | Base de calcul | Preuve |
|---|---|---|---|
| `pricing.ts` | 0,15 | `serviceFee` seul | `pricing.ts:80,130` |
| `domain.ts` | 0,10 | `service + delivery` | `domain.ts:90,113` |
| Défaut SQL | 0,10 | sans objet | `20260812234751:69` |

La vérification adversariale a précisé le mécanisme réel, ce qui corrige la lecture initiale. Dans le flux nominal, le taux **effectivement appliqué reste 0,15** : la course est créée avec `commission_rate = 0.15` en base, valeur `NOT NULL`, et la facture lit cette valeur stockée. Le repli à 0,1 ne se déclenche jamais par ce chemin. L'incohérence réelle ne vient donc pas d'un écart de taux, mais de **l'écart de base** : le devis commissionne le seul frais de service alors que la facture recalcule sur service plus livraison, le shopper saisissant un frais de livraison non nul à la facturation. S'y ajoute `acceptOffer` qui remplace `service_fee` sans recalculer `commission_amount`, `runner_payout` ni `total_amount`. La double constante reste un piège latent : toute insertion future sans `commission_rate` basculerait silencieusement à 0,10.

### 5.8 Vérification contre la base réelle

Les constats déduits des migrations ont été confrontés à l'état effectif du projet distant, par introspection des catalogues système en lecture seule. Aucune écriture n'a été effectuée.

**Ce qui est confirmé.**

| Constat | Vérification en base | Verdict |
|---|---|---|
| RLS activée partout | 16 tables, `relrowsecurity = true` sur les 16 | Confirmé |
| P0-1, mise à jour de course sans garde de colonne | Politique « Participants update errand », `with_check` vaut **null** : Postgres réutilise le USING comme WITH CHECK, aucune restriction de colonne | **Confirmé en base** |
| P0-1 étendu | Même défaut sur « Offer update by parties » et « Participants confirm payments », `with_check` null sur les deux | **Confirmé en base** |
| P0-2, auto-validation shopper | INSERT « Runner creates own profile » contraint `user_id`, `full_name` et `phone`, **jamais `status`**. UPDATE « Runner updates own profile » a un `with_check` null | **Confirmé en base** |
| Fuite des données shopper | SELECT « Runner reads own profile » : `USING (user_id = auth.uid() OR status = 'approved' OR admin OR moderator)`, donc lecture de la ligne entière, `phone`, `whatsapp` et `id_doc_url` compris | **Confirmé en base** |
| Retrait sans contrôle de solde | INSERT « Own payout requests create » : `WITH CHECK (user_id = auth.uid() AND amount > 0)`, aucune comparaison au solde | **Confirmé en base** |
| Crédits de parrainage libres | INSERT « Own referral create » : `WITH CHECK (user_id = auth.uid())` seul | Confirmé |
| Portefeuille jamais crédité | Inventaire exhaustif des triggers : tous appellent `update_updated_at_column`, sauf `trg_runner_wallet` qui appelle `ensure_runner_wallet`. **Aucun trigger AFTER UPDATE sur `errands`**, donc aucun mécanisme de crédit | **Confirmé en base** |
| Clés étrangères manquantes | 9 colonnes UUID sans contrainte : `errand_payments.payer_id` et `confirmed_by`, `payout_requests.user_id`, `place_moderation_events.place_id` et `moderator_id`, `referrals.user_id`, `runner_payout_accounts.user_id`, `runner_wallets.user_id`, `wallet_entries.user_id` | Confirmé, liste exacte |
| Aucun bucket privé | Un seul bucket, `place-images`, `public = true`, sans limite de taille de fichier | **Confirmé en base** |
| Synchronisation des migrations | Les migrations du dépôt sont bien appliquées, les quatre dernières versions correspondent aux noms de fichiers | Confirmé, pas de dérive |

**Ce que la base révèle en plus, et qui nuance l'urgence.**

| Entité | Volume réel |
|---|---|
| `auth.users` | 1 |
| `profiles` | 1 |
| `user_roles` | 2, un `admin` et un `user` |
| `places` | 0, dont 0 publié |
| `leads`, `errands`, `errand_offers`, `errand_payments` | 0 |
| `runner_profiles` | 0, dont 0 approuvé |
| `runner_wallets`, `wallet_entries`, `payout_requests` | 0 |

**La base est vide.** Aucun lieu, aucune course, aucun shopper, aucun mouvement financier, un seul compte qui porte déjà le rôle administrateur. Trois conséquences pour la conduite du projet :

1. **L'urgence opérationnelle est faible, la gravité structurelle reste entière.** Les défauts P0 n'exposent aujourd'hui aucune donnée réelle et ne mettent aucun argent en jeu. Ils doivent être corrigés avant le lancement, pas dans l'urgence d'un incident en cours.
2. **Corriger maintenant coûte le moins cher qu'il ne coûtera jamais.** Poser les WITH CHECK, les clés étrangères et les contraintes de montants sur une base vide évite toute reprise de données. Chaque semaine d'exploitation rendra ces migrations plus lourdes.
3. **Le branchement de la Découverte (P1-8) exige un peuplement.** Comme `places` ne contient aucune ligne publiée, brancher les écrans publics sur Supabase afficherait aujourd'hui un catalogue vide. Le lot doit donc inclure la migration des 7 lieux de `data.ts` vers des données de démarrage, ou la saisie de fiches partenaires réelles, sous peine de remplacer une maquette par une page blanche.

## 6. Audit du dépôt, de la livraison et des secrets (5.4)

### 6.1 GitHub, et non GitLab

Le remote est **GitHub** en lecture comme en écriture : `https://github.com/Jean-Christ1/akwaba-ci.git`. Aucun projet GitLab correspondant n'existe pour ce dépôt. Conformément à la consigne, **aucun miroir GitLab n'a été créé** : c'est une décision à prendre, consignée en section 7. En conséquence, la livraison se fait par **Pull Request GitHub** et non par Merge Request.

### 6.2 Branches et historique

| Constat | Mesure |
|---|---|
| Branches distantes | `main`, `develop` |
| Avance de `develop` sur `main` | 126 commits |
| Commits propres à `main` | 0, `main` est un ancêtre direct de `develop` |
| Dernier commit de `main` | `6ef06dc`, 5 mai 2026, « Ajouté document stratégique v1 » |
| Messages automatiques « Changes » | 101 sur 126 |

`main` ne contient donc **que le document stratégique initial et aucun code applicatif**. Il n'existe aucun flux de publication de `develop` vers `main`. La fusion resterait techniquement une avance rapide, mais représenterait 126 commits non revus d'un coup.

L'historique est peu traçable : 101 des 126 messages sont l'étiquette automatique de Lovable. Impossible de savoir ce qu'un commit modifie sans lire son diff.

### 6.3 Secrets suivis

Le fichier `.env` **est suivi par git** et `.gitignore` ne le couvre pas (seul `*.local` s'en approche, sans correspondre).

Vérification du contenu, valeurs masquées : le fichier ne contient que `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_PUBLISHABLE_KEY` et `VITE_SUPABASE_URL`. Le décodage du JWT confirme `"role":"anon"`. Il s'agit donc de la clé publishable, **conçue pour être exposée côté client** et de toute façon présente dans le bundle Vite via le préfixe `VITE_`. Ce n'est pas une fuite de `service_role`.

La vérification adversariale a donc **abaissé ce constat de P1 à P2**. Les secrets réellement sensibles (`SUPABASE_SERVICE_ROLE_KEY`, `BOOTSTRAP_ADMIN_TOKEN`, `RESEND_API_KEY`, `LOVABLE_API_KEY`) ne transitent jamais par ce fichier : ils sont lus côté serveur via `Deno.env.get()` et gérés par les secrets Supabase. Le motif en place est correct.

Le risque demeure néanmoins réel et doit être corrigé, pour trois raisons : la règle de gouvernance interdit de versionner un `.env` ; toute variable sensible ajoutée plus tard serait capturée automatiquement faute d'entrée dans `.gitignore` ; l'historique conserverait la valeur même après correction.

Point connexe : `.lovable/plan.md` est suivi et `.lovable/` n'est pas ignoré. Ce document interne décrit la mécanique d'amorçage administrateur, dont le nom du secret `BOOTSTRAP_ADMIN_TOKEN`. Aucune valeur de secret n'y figure, mais si le dépôt est public, cela facilite la reconnaissance. La visibilité du dépôt n'a pas pu être vérifiée sans accès à l'API GitHub.

### 6.4 Intégration continue et déploiement

**Aucune intégration continue n'existe** : ni `.github/workflows`, ni `.gitlab-ci.yml`. Aucune configuration de déploiement dédiée non plus, ni `vercel.json` ni `netlify.toml`. Le déploiement présumé passe par Lovable. Le build est une application monopage Vite sans chemin de base, cohérent avec un hébergement sur domaine racine, l'URL canonique étant `https://akwaba.ci/` (`index.html:10`).

Rien ne vérifie donc lint, types, tests ni build avant qu'une modification atteigne `develop`. Combiné à un lint actuellement rouge de 76 erreurs et à un `tsc` non strict, aucun garde-fou n'est en place.

**Proposition de CI minimale**, non créée à ce stade : un workflow déclenché sur `pull_request` vers `develop` et `main`, enchaînant récupération du code, installation Node avec cache, installation des dépendances avec le gestionnaire unique retenu, puis quatre étapes bloquantes, `lint`, vérification de types via `tsc --noEmit`, tests Vitest et build. Une cinquième étape `deno test` couvrirait les tests des fonctions edge, aujourd'hui non exécutés car le motif Vitest ne cible que `src`. La protection de branche exigerait ces vérifications avant fusion.

### 6.5 Recherche de secrets exposés

Une recherche ciblée sur les fichiers suivis, hors fichiers de verrouillage, portant sur `service_role`, les motifs de clés privées, les préfixes de clés Stripe et Brevo, ainsi que sur les chaînes de JWT, ne remonte **aucune valeur de secret en dur**. Les seules occurrences de `service_role` sont des `GRANT ... TO service_role` dans les migrations et des appels `Deno.env.get()` dans les fonctions edge. La seule chaîne ressemblant à un JWT hors `.env` est une expression régulière de masquage dans `AdminPage.tsx:130`.

## 7. Backlog priorisé (5.5)

Priorités : **P0** blocage de sécurité, perte de données, paiement, authentification ou build cassé. **P1** indispensable au MVP Shopper réellement utilisable. **P2** forte amélioration produit après le MVP transactionnel. **P3** optimisation ou extension.

Les sévérités ci-dessous intègrent les verdicts de la vérification adversariale : une remontée en P0, quatre abaissements.

| ID | Priorité | Domaine | Problème / besoin | Risque | Dépendances | Critère de terminé |
|---|---|---|---|---|---|---|
| P0-1 | P0 | Paiement, RLS | Déplacer l'autorité du paiement et des montants côté serveur. Les politiques UPDATE de `errands`, `errand_offers` et `errand_payments` n'ont aucun WITH CHECK de colonne, et `confirmPayment` clôture sur simple clic client. | Fraude financière, montants auto-déclarés, intégrité monétaire nulle. Bloquant absolu. | aucune | Confirmation de paiement et écriture des montants passent par une fonction edge ou un trigger SECURITY DEFINER qui recalcule et vérifie. WITH CHECK stricts sur les colonnes monétaires et `payment_status`. Test prouvant qu'un update client direct est rejeté. |
| P0-2 | P0 | Sécurité, RLS | Empêcher l'auto-validation shopper : `status` non contraint à l'INSERT et à l'UPDATE de `runner_profiles`. | Contournement du KYC sur une place de marché où circulent avances et espèces. | aucune | WITH CHECK imposant `status='pending'` à l'INSERT, interdiction de modifier `status` par le propriétaire, transition réservée aux modérateurs. Test prouvant l'échec d'une auto-approbation. |
| P1-1 | P1 | Paiement, portefeuille | Créditer le portefeuille shopper côté serveur à la clôture : `wallet_entries` earning et commission, mise à jour `pending_balance` puis `available_balance`. | Le shopper ne perçoit jamais rien, le pilier monétaire est non fonctionnel. | P0-1 | Trigger ou fonction edge idempotent, une seule fois par course. Solde reflétant les gains réels. Crédit interdit côté client. |
| P1-2 | P1 | Paiement, portefeuille | Sécuriser le retrait : contrôle serveur `amount <= available_balance`, débit atomique, interface admin de traitement des `payout_requests`. | Double dépense potentielle, retrait inopérant. | P0-1, P1-1 | Demande validée et débitée atomiquement avec verrou de ligne, vue admin `requested` vers `processing` puis `paid`, entrée de portefeuille `payout` journalisée. |
| P1-3 | P1 | Tarification | Unifier une seule constante et une seule fonction de commission, base non ambiguë, barème versionné persisté sur la course. | Commission affichée au devis différente de la facture, rémunération non traçable, piège latent à 0,10. | aucune | Une fonction partagée consommée par devis et facture, base unique documentée, barème stocké à la création. Doublon de `domain.ts` supprimé. Tests de cohérence devis contre facture. |
| P1-4 | P1 | Preuves | Câbler le workflow promis : capture d'avance et reçu vers Storage et `errand_payments`, affichage du code de remise, vérification par le runner avant clôture. | Garanties de confiance annoncées non tenues, clôture sans preuve. | P0-1, P1-6 | Code de remise affiché et vérifié, `advance_proof_url` et `receipt_url` renseignés, `errand_payments` alimentée, clôture impossible sans reçu. |
| P1-5 | P1 | Confidentialité | Restreindre la lecture de `runner_profiles` : téléphone, WhatsApp et document d'identité lisibles par tout utilisateur connecté. | Fuite des coordonnées et pièces d'identité de tous les shoppers validés. | aucune | Vue sécurisée exposant seulement les colonnes non sensibles, coordonnées révélées au seul client d'une course assignée, `id_doc_url` jamais exposé. |
| P1-6 | P1 | Stockage | Créer des buckets privés dédiés pour pièces d'identité et preuves de paiement. | Exposition mondiale de documents sensibles s'ils sont branchés sur le bucket public. | aucune | Buckets `public=false`, politiques propriétaire plus modérateur, accès par URL signée à durée courte. |
| P1-7 | P1 | Sécurité, routage | Introduire une protection de route par rôle pour `/admin/*` et le back-office shopper. `PlaceEditorPage` n'a aucun garde et utilise `user!.id`. | Gardes incohérents, seule barrière réelle est la RLS. | aucune | Composant de route factorisant chargement et redirection, vérification indépendante que la RLS interdit toute mutation non autorisée. |
| P1-8 | P1 | Câblage données | Brancher la Découverte sur la table `places` filtrée sur `status='published'`, en remplacement du tableau statique. | Une fiche partenaire publiée n'apparaît jamais côté public, boucle partenaire vers client rompue. | aucune | Les six écrans consomment un adaptateur `places-supabase`, `data.ts` déplacé en données de démarrage de développement, `getPlaceBySlug` résout les fiches réelles. |
| P2-1 | P2 | Tarification | Recalculer `commission_amount`, `runner_payout` et `total_amount` dans `acceptOffer`. | Champs monétaires périmés après acceptation à un prix différent. Deviendrait P0 si un versement les lisait. | P1-3 | Les trois colonnes recalculées dans la même mise à jour ou par trigger. Test de cohérence après changement de prix. |
| P2-2 | P2 | Machine à états | Ajouter les transitions d'annulation et de litige, aujourd'hui inaccessibles, avec gel du portefeuille et parcours de résolution. | Garantie litige inexistante, seule la ligne heureuse est couverte. | P0-1, P1-1 | Actions d'annulation avant et après affectation, ouverture de litige, gel du portefeuille, résolution par un modérateur. |
| P2-3 | P2 | Confiance runner | Incrémenter `jobs_completed` et recalculer `rating` côté serveur, ajouter une interface de notation. | Signaux de confiance figés à zéro, promesse non tenue. | P0-1 | Agrégats mis à jour à la complétion, interface de notation alimentant `errands.rating`. |
| P2-4 | P2 | Tarification, géo | Ancrer distance et durée à une adresse géocodée dérivée du service d'itinéraire. | Assiette tarifaire non vérifiée, défauts 5 km et 60 min saisis librement. | P1-3 | Capture des coordonnées à la création, distance et durée issues du routage et figées pour le calcul. |
| P2-5 | P2 | Confidentialité | Masquer l'adresse fine et les notes tant qu'une course ouverte n'est pas assignée. | Adresse précise diffusée à tous les shoppers avant mise en relation. | aucune | Flux ouvert limité à la zone approximative, adresse révélée au seul shopper assigné. |
| P2-6 | P2 | Fiabilité | Corriger la réservation : envoyer un vrai UUID, ou en transitoire `place_id=null` avec le nom du lieu dans le message. | Insertion de lead cassée pour tous les lieux, unique canal de conversion Découverte non fonctionnel. | P1-8 | Insertion réussie contre la base, test d'intégration sur `submit-lead`. |
| P2-7 | P2 | Favoris | Adaptateur favoris Supabase pour les utilisateurs connectés, avec reprise des favoris locaux. | Favoris limités à un appareil, références statiques cassées à la bascule. | P1-8 | Favoris persistés par compte, reprise des entrées locales à la connexion, références UUID réelles. |
| P2-8 | P2 | Navigation | Relier `/itineraire` depuis la fiche lieu et la carte, ou trancher pour l'ouverture externe et retirer la page. | Fonctionnalité développée et fonctionnelle mais inatteignable. | aucune | Bouton pointant vers `/itineraire` avec paramètres, ou page retirée selon décision produit. |
| P2-9 | P2 | Navigation, filtres | Aligner les catégories affichées sur les données réellement disponibles. | Clics vers des résultats systématiquement vides. | P1-8 | Catégories reflétant le catalogue réel, aucun raccourci vers un état vide. |
| P2-10 | P2 | CI/CD | Ajouter une CI GitHub Actions sur `pull_request`, avec lint bloquant, types, tests, build et tests Deno. | Aucun garde-fou, du code non conforme peut atteindre l'intégration. | P2-11, P2-14 | Pipeline vert sur une PR de référence, fusion bloquée si un contrôle échoue. |
| P2-11 | P2 | Qualité, lint | Réparer la chaîne de lint : exclure `supabase/functions` du lint front, corriger le `require` de `tailwind.config.ts:104`, traiter les `any` de production. | 76 erreurs, chaîne rouge, dette qui s'accumule sans alerte. | aucune | `npm run lint` sans erreur, `no-unused-vars` réactivé en avertissement. |
| P2-12 | P2 | Qualité, typage | Réactiver progressivement le mode strict, en priorité `strictNullChecks` et `noImplicitAny`, ajouter un script de vérification de types. | Accès nuls et `any` implicites non détectés sur du code touchant paiement et authentification. | aucune | Script `typecheck` présent et vert, options actives sur `src`, erreurs corrigées par lots. |
| P2-13 | P2 | Gouvernance, secrets | Retirer `.env` du suivi, l'ajouter à `.gitignore`, fournir un `.env.example`, vérifier l'historique. | Clé anon publique aujourd'hui, mais tout secret ajouté plus tard serait committé. | aucune | `.env` désindexé, `.gitignore` couvrant `.env*`, `.env.example` fourni, historique vérifié. |
| P2-14 | P2 | Reproductibilité | Choisir un seul gestionnaire de paquets et retirer l'autre fichier de verrouillage du suivi. | Builds locaux, CI et Lovable non déterministes, dérive déjà visible. | aucune | Un seul fichier de verrouillage suivi et à jour, choix documenté, CI alignée. |
| P2-15 | P2 | Performance | Introduire le découpage du bundle : pages en chargement différé, isoler `maplibre-gl` et `recharts`. | Bundle unique de 522 Ko compressés, pénalisant sur réseaux mobiles. | aucune | Chunk d'entrée sous 500 Ko, carte et back-office chargés à la demande. |
| P2-16 | P2 | Maintenabilité | Décomposer `AdminPage.tsx`, 774 lignes, en sous-composants par onglet et un hook temps réel. | Au-delà du plafond de 500 lignes, densité de dette la plus forte, testabilité nulle. | aucune | Fichiers sous 300 lignes, logique de modération en hook, `any` remplacés par les types générés. |
| P2-17 | P2 | Intégrité schéma | Ajouter les clés étrangères manquantes vers `auth.users` et `places`, avec `ON DELETE` adapté. | Aucune intégrité référentielle, lignes financières orphelines. | aucune | Migration corrective posant les contraintes avec cascades cohérentes. |
| P2-18 | P2 | Schéma produit | Planifier les tables cibles manquantes : `pricing_rules` et `commission_rules` en priorité, puis `disputes`, `service_areas`, `errand_stops`, `payment_intents`, `audit_logs`. | Modèle cible incomplet, tarification et litige non structurés côté base. | P1-3 | Tables prioritaires créées et câblées, décision documentée pour les tables différées. |
| P2-19 | P2 | Fiabilité état | Adopter react-query pour les lectures, ou retirer la dépendance. Afficher les erreurs aujourd'hui avalées. | Un échec réseau ou RLS s'affiche comme un état vide légitime. | aucune | États d'erreur explicites avec possibilité de réessayer, ou dépendance retirée. |
| P2-20 | P2 | Git, publication | Définir le rôle des branches et établir un flux de publication par PR revue. | Confusion de référence, déploiement accidentel d'une `main` sans fonctionnalités. | aucune | Flux documenté dans le README, première publication `develop` vers `main` revue. |
| P2-21 | P2 | Sécurité, RLS | Forcer `credits=0` et `invited_count=0` à la création de `referrals`, borner `commission_rate` à l'INSERT de `errands`. | Valeurs sensibles librement insérables, dangereuses si consommées. | aucune | WITH CHECK contraignant les champs, attribution de crédits réservée au service. |
| P2-22 | P2 | Anti-spam | Router les soumissions publiques de leads exclusivement via `submit-lead`, avec captcha ou limitation de débit. | Remplissage massif de la table `leads` par un acteur non authentifié. | aucune | INSERT anonyme direct retiré ou limité, protection en place. |
| P3-1 | P3 | Observabilité | Remplacer les six `console.*` résiduels par un journal conditionnel. | Détails techniques exposés en console navigateur. | aucune | Aucun journal de débogage en production. |
| P3-2 | P3 | Cohérence UI | Choisir un seul système de notification et retirer le second. | Double surface UI, ambiguïté, poids superflu. | aucune | Un seul système monté, dépendances associées retirées. |
| P3-3 | P3 | Documentation | Documenter le README, renommer le paquet, ajouter `PROJECT_SETUP.md`, `DECISIONS.md` et une note d'architecture. | README placeholder, paquet générique, aucun accueil de contributeur. | aucune | README complet, métadonnées à jour, documents présents. |
| P3-4 | P3 | Navigation | Pointer le bouton Connexion du bandeau de bureau vers `/auth`. | Friction de deux clics sur l'authentification. | aucune | Connexion menant directement à `/auth`. |
| P3-5 | P3 | Code mort | Supprimer la constante MapTiler inutilisée et le fichier `Index.tsx`. | Code mort laissant croire à des dépendances inexistantes. | aucune | Constante et fichier supprimés, build vert. |
| P3-6 | P3 | Qualité schéma | Fixer `numeric(12,2)` et contraintes de positivité sur les montants, `numeric(9,6)` sur les coordonnées, borner `rating`, ajouter les index de filtrage. | Colonnes monétaires et géographiques non contraintes. | aucune | Migration posant précisions, contraintes et index. |
| P3-7 | P3 | Dépendances externes | Remplacer le serveur OSRM de démonstration et les tuiles directes par un service avec clé et quota, sécuriser les salles de visioconférence. | Aucun engagement de service, salle rejoignable par un tiers connaissant l'identifiant. | aucune | Routage et tuiles avec clé en production, salles authentifiées. |
| P3-8 | P3 | Performance | Filtrer l'abonnement temps réel du tableau de bord runner et faire des mises à jour incrémentales. | Rechargement global à chaque mutation, non extensible. | aucune | Abonnement filtré, mises à jour incrémentales. |
| P3-9 | P3 | Gouvernance git | Vérifier la visibilité du dépôt, ajouter `.lovable/` au `.gitignore` et retirer `plan.md` du suivi. | Aide à la reconnaissance de la logique d'attribution de rôles si le dépôt est public. | aucune | `.lovable` ignoré, `plan.md` désindexé si le dépôt est ou peut devenir public. |
| P3-10 | P3 | Traçabilité | Adopter les Conventional Commits, imposer un message de PR descriptif. | Historique non traçable, diagnostic de régression dégradé. | aucune | Convention adoptée et appliquée aux nouvelles PR. |
| P3-11 | P3 | Fonctions edge | Renvoyer un message générique au client, restreindre CORS à une liste d'origines autorisées. | Fuite d'information technique et surface CORS large. | aucune | Erreurs journalisées côté serveur mais génériques côté client, liste d'origines en place. |

## 8. Décisions nécessitant une validation humaine

Ces points ne sont pas tranchés dans ce rapport. Ils conditionnent plusieurs éléments du backlog et doivent être arbitrés avant les lots concernés.

1. **Modèle de paiement Shopper.** Intégration sur la plateforme via un agrégateur mobile money ivoirien avec fonds en séquestre, ou transfert direct hors plateforme entre client et shopper ? Ce choix conditionne P0-1, P1-1 et l'existence même de `errand_payments` et `payment_intents`.
2. **Taux de commission officiel et base de calcul.** Frais de service seul, comme l'indique le commentaire de `pricing.ts`, ou service plus livraison, comme le calcule `domain.ts` ? Valeur retenue, 0,10 ou 0,15, et règle de versionnement du barème.
3. **Modèle de portefeuille.** Gains en solde en attente avec délai anti-litige, puis solde disponible, ou crédit immédiat ? Règles de gel en cas de litige.
4. **Politique KYC des shoppers.** Validation manuelle obligatoire avant activation, gestion et conservation des pièces d'identité, durée de rétention, conformité aux données personnelles.
5. **Source de vérité du catalogue de lieux.** Bascule des écrans publics vers la table `places`, et devenir des 7 lieux de `data.ts`, migration en données de démarrage ou suppression.
6. **Stratégie d'itinéraire.** Conserver la page interne OSRM comme fonctionnalité produit, ou standardiser sur l'ouverture d'applications externes et retirer la page.
7. **Confidentialité du flux de courses ouvertes.** Niveau de détail exposé aux shoppers avant affectation, zone seule ou adresse complète.
8. **Périmètre MVP du modèle cible.** Inclusion ou report des tables `service_areas`, `errand_stops`, `disputes` et `audit_logs`.
9. **Gestionnaire de paquets unique.** Conserver bun, retenu par Lovable, ou standardiser sur npm.
10. **Visibilité du dépôt GitHub**, décision de rotation de la clé anon Supabase, et retrait de `.lovable/plan.md` du suivi.
11. **Fournisseurs de production** pour le routage cartographique et la visioconférence, en remplacement des services de démonstration.
12. **Politique de notation et de réputation**, déclenchement des agrégats et interface de notation client.
13. **Miroir GitLab.** Le dépôt est exclusivement sur GitHub. Faut-il créer un projet GitLab correspondant, ou rester sur GitHub avec livraison par Pull Request ?

## 9. Commandes exécutées et résultats

Toutes les commandes ont été exécutées sur `develop` au commit `510af45`, après installation des dépendances.

| Commande | Résultat |
|---|---|
| `npm install --no-audit --no-fund` | 550 paquets ajoutés, succès |
| `npm run test` | 31 tests passés sur 31, 3 fichiers, durée 164 s |
| `npx tsc --noEmit -p tsconfig.app.json` | Code de sortie 0, aucune erreur, mais mode non strict |
| `npm run lint` | 86 problèmes, 76 erreurs et 10 avertissements |
| `npm run build` | Succès en 2 min 49 s, chunk unique de 1 928 284 octets, avertissement de dépassement de 500 Ko |
| `git rev-list --count main..develop` | 126 |
| `git rev-list --count develop..main` | 0 |
| `git ls-files .env` | `.env`, le fichier est bien suivi |
| `git grep` sur motifs de secrets | Aucune valeur en dur, seulement des `Deno.env.get()` et des `GRANT` |
| Connexion PostgreSQL au projet distant | Établie en lecture seule, région eu-west-3 |
| Introspection `pg_class`, `pg_policy` | 16 tables, RLS active partout, `with_check` null sur 4 politiques UPDATE sensibles |
| Introspection `pg_trigger` | Aucun trigger de crédit de portefeuille, uniquement horodatage et création à zéro |
| Introspection `pg_constraint` | 9 colonnes UUID sans clé étrangère |
| Requête `storage.buckets` | Un seul bucket, public, sans limite de taille |
| Requête `supabase_migrations.schema_migrations` | Migrations du dépôt appliquées, aucune dérive |
| Comptages sur les 14 entités métier | Base vide, 1 utilisateur, 2 rôles, tout le reste à zéro |
| API Management Supabase `/v1/projects` | HTTP 401, jeton du coffre invalide pour ce projet, advisors non exécutés |

Répartition des tests existants : 20 tests d'utilitaires de modération, 10 tests de bout en bout du flux de modération, 1 test d'exemple. Trois tests Deno existent sous `supabase/functions` mais **ne sont pas exécutés** par `npm test`, le motif Vitest ne ciblant que `src`.

## 10. Proposition de Lot 1

Le Lot 1 vise la stabilisation du socle technique et de la gouvernance, **sans toucher à la logique métier ni au paiement**, traités dans un Lot 2 prioritaire. Tous les éléments retenus sont à faible risque et sans dépendance métier.

| Élément | Référence | Contenu |
|---|---|---|
| Fichier de verrouillage unique | P2-14 | Trancher bun contre npm, retirer l'autre du suivi, aligner la documentation |
| Secrets hors suivi | P2-13, P3-9 | Retirer `.env` du suivi, couvrir `.env*` dans `.gitignore`, fournir `.env.example`, ignorer `.lovable/` |
| Chaîne de qualité | P2-11, P2-12 | Réparer ESLint jusqu'au vert, ajouter un script de vérification de types, réactiver progressivement les options strictes |
| CI minimale | P2-10 | Workflow sur `pull_request`, lint, types, tests, build, tests Deno, plus protection de branche |
| Documentation | P3-3, P2-20 | README complet, renommage du paquet, `PROJECT_SETUP.md`, `DECISIONS.md`, note d'architecture, flux de branches |
| Nettoyage optionnel | P3-5, P3-2 | Code mort et unification des notifications, si la fenêtre le permet |

**Hors périmètre du Lot 1**, volontairement : le découpage du bundle (P2-15), la décomposition de `AdminPage` (P2-16), et toute correction de sécurité RLS ou de paiement.

**Réserve importante** : les constats P0-1 et P0-2 concernent l'intégrité financière et le contournement du contrôle KYC. Si une mise en service, même pilote, est envisagée à court terme, ils doivent être traités **sans attendre la fin du Lot 1**.

## 11. Limites de cet audit

Ce que ce rapport **garantit**, avec preuve rejouable :

- L'état du schéma, des politiques RLS, des triggers, des clés étrangères, des buckets et des volumes de données, **vérifié par introspection directe de la base réelle** (section 5.8).
- L'état de la chaîne de qualité, tests, types, lint et build, **vérifié par exécution** (section 9).
- L'état du dépôt, branches, fichiers suivis et absence de CI, **vérifié par commandes git** (section 9).

Ce que ce rapport **ne garantit pas**, et qui devra être vérifié ultérieurement :

- **Advisors Supabase non exécutés.** Le jeton d'accès Management du coffre est invalide (401) et provient d'un autre projet. Les recommandations automatiques de sécurité et de performance de Supabase restent à obtenir, avec un jeton valide.
- **Aucune exécution applicative.** Les défauts fonctionnels sont établis par lecture de code, non par exécution du parcours dans un navigateur. L'échec d'insertion du lead reste à reproduire en conditions réelles, d'autant que la table `places` est vide.
- **Aucun test de pénétration.** Les failles RLS sont prouvées **structurellement** en base, le `with_check` absent est un fait vérifié, mais l'exploitabilité de bout en bout n'a pas été mise en scène : cela demanderait de créer un compte de test et d'écrire dans la base, ce qui sort du cadre d'un audit en lecture seule. Cette démonstration fait partie des critères de terminé de P0-1 et P0-2.
- **Visibilité du dépôt GitHub non vérifiée**, faute d'accès à l'API. La sévérité de la divulgation de `.lovable/plan.md` en dépend.
- **Historique git non purgé ni analysé en profondeur** pour d'anciens secrets. Seul l'état courant des fichiers suivis a été examiné.
