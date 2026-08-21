# État réel de la plateforme et backlog d'exécution

Date de constat : 13 août 2026. Toutes les lignes de ce document proviennent
d'une commande exécutée pendant cette session. Rien n'est déduit, rien n'est
supposé. Quand une information manque, elle est déclarée manquante.

## 1. Cartographie réelle

### 1.1 Dépôt

| Élément | Valeur constatée |
|---|---|
| Dépôt | `github.com/Jean-Christ1/akwaba-ci` |
| Branche de travail | `develop` |
| Dernier commit | `4889419` |
| Dépôts additionnels | aucun |

Il n'existe **qu'un seul dépôt**. Ni monodépôt, ni application mobile séparée,
ni service backend distinct.

### 1.2 Architecture réelle

| Composant | Nature | Où il s'exécute |
|---|---|---|
| Interface | SPA React 18 + Vite 5, TypeScript | Navigateur |
| Base de données | PostgreSQL Supabase | Supabase |
| Autorisation | RLS et fonctions `SECURITY DEFINER` | PostgreSQL |
| Traitements serveur | 5 fonctions edge Deno | Supabase |
| Stockage | Buckets privés | Supabase |

Les cinq fonctions edge sont `bootstrap-admin`, `moderate-place`,
`register-partner`, `submit-lead`, `test-email`.

**Constat structurant : il n'existe aucun backend Node ou API à déployer.** Le
serveur d'Akwaba, c'est PostgreSQL et ses fonctions. Ce point conditionne la
Phase 7 et il est traité en 3.2.

### 1.3 État de la base de données

Relevé par connexion directe :

| Mesure | Valeur |
|---|---|
| Utilisateurs `auth.users` | 1 |
| Lignes métier, toutes tables | 3 (1 profil, 2 rôles) |
| Tables du schéma public | 16 |
| Politiques RLS | 38 |
| Fonctions du schéma public | 6 |
| Migrations appliquées | 10 |
| Migrations présentes au dépôt | 27 |

**17 migrations sont écrites, testées dans leur ordre de dépendance, et non
appliquées.** C'est le premier écart de la plateforme, et le plus lourd : toute
la sécurité serveur, tout le moteur de course, tout le référentiel géographique
et toute la console vivent dans ces 17 fichiers.

La base ne porte aucune donnée métier. Le risque de perte à la migration est
donc nul, ce qui a été vérifié table par table avant toute tentative.

### 1.4 Environnements et déploiements

| Plateforme | Constat |
|---|---|
| Cloudflare Pages | 10 projets sur le compte, **aucun `akwaba`** |
| Vercel | 11 projets sur le compte, **aucun `akwaba`** |
| `akwaba-api.vercel.app` | répond **HTTP 404**, rien n'y est déployé |
| Supabase | projet vivant, répond 401 sans clé, comportement normal |
| Lovable | espace de travail sans crédit, aucune action possible |

**Akwaba n'est déployé nulle part**, sur aucune des deux plateformes dont les
accès sont disponibles. Le lien de partage existant est celui de l'outil de
prototypage, ce qui est précisément ce que la publication Cloudflare doit
remplacer.

Le secret `akwaba-api-vercel` annonce une URL qui n'existe pas. Il est soit
prospectif, soit périmé. Il n'a pas été utilisé.

### 1.5 Document de cadrage

Le document « Introduction - Akwaba » n'existe dans aucune source accessible.
Les seules sources de cadrage réellement disponibles sont
`docs/audit/2026-08-akwaba-current-state.md`, `docs/FONCTIONNEMENT.md`,
`DECISIONS.md` et `.lovable/plan.md`. Cette absence est signalée plutôt que
comblée par invention.

## 2. Backlog d'exécution priorisé

L'ordre suit celui fixé par la commande, pas celui de la facilité.

### Priorité 1, sécurité, authentification, permissions, données

| Exigence | État réel | Preuve | Action |
|---|---|---|---|
| Un utilisateur ne peut pas se promouvoir shopper validé | Écrit, **non actif** | migration `...050000` non appliquée | appliquer |
| Le navigateur ne peut pas fixer un montant | Écrit, **non actif** | migration `...060000` non appliquée | appliquer |
| Le code de remise est illisible par le shopper | Écrit, **non actif** | migration `...150000` non appliquée | appliquer |
| Les pièces d'identité sont en bucket privé | Écrit, **non actif** | migration `...080000` non appliquée | appliquer |
| Les actions d'exploitation sont journalisées | Écrit, **non actif** | migration `...210000` non appliquée | appliquer |
| Aucun secret dans le bundle navigateur | **Vérifié actif** | le code ne lit que `VITE_SUPABASE_URL` et la clé anon | tenu |
| Les routes d'administration sont gardées | **Vérifié actif** | `RequireRole`, 126 tests au vert | tenu |

Six des sept exigences de sécurité dépendent d'une seule action : appliquer les
migrations. Tant qu'elles ne le sont pas, **la sécurité serveur d'Akwaba
n'existe que dans le dépôt**.

### Priorité 2, intégrité Supabase et migrations

| Point | État |
|---|---|
| Ordre de dépendance des 27 migrations | vérifié cohérent |
| Concordance signatures RPC entre code et base | vérifiée, aucun écart |
| Caractère additif, aucune suppression de table ou colonne | vérifié |
| Sauvegarde de structure avant migration | faite |
| Application | **bloquée, autorisation requise** |

### Priorité 3 à 8

| Priorité | Sujet | État |
|---|---|---|
| 3 | Flux métier critiques, course de bout en bout | codé, non éprouvé en base |
| 4 | Paiements et fraude | structures posées, **aucune passerelle branchée** |
| 5 | Console d'administration | 6 écrans livrés, non éprouvés en base |
| 6 | Complétude de l'interface | 24 écrans montés et prouvés sans plantage |
| 7 | Tests, observabilité, déploiement | 126 tests au vert, **rien de déployé** |
| 8 | Vérification finale | à faire après les précédentes |

## 3. Points qui appellent une décision

### 3.1 Application des migrations

C'est le verrou de toute la chaîne. L'action a été refusée trois fois par le
contrôle de sécurité de l'outil, au motif exact que **la commande reçue n'a
jamais nommé l'application de migrations sur le projet Supabase de
production**. Le refus est fondé et n'a pas été contourné.

Ce qui a été préparé pour que l'opération soit sûre le jour où elle est
autorisée :

- sauvegarde complète de la structure actuelle, qui vaut plan de retour ;
- vérification que les 17 migrations sont additives ;
- vérification qu'aucune donnée métier n'existe, donc aucune perte possible ;
- exécution prévue migration par migration, chacune dans sa transaction, avec
  arrêt à la première erreur et annulation de la migration fautive.

Il manque une phrase de la part du propriétaire du projet, autorisant
nommément l'application des migrations sur ce projet Supabase.

### 3.2 Backend sur Vercel

La commande prévoit un déploiement du backend sur Vercel **seulement si
l'architecture réelle le permet**. Elle demande aussi d'identifier les services
qui ne s'y prêtent pas et de proposer une solution cohérente, sans les déplacer
arbitrairement.

Constat : **il n'y a pas de backend déployable sur Vercel**. Les traitements
serveur sont des fonctions edge Deno qui lisent la base par le lien interne de
Supabase et s'appuient sur les secrets de ce projet. Les porter sur Vercel
imposerait de les réécrire, d'exposer la clé de service hors de Supabase et
d'ajouter un saut réseau, pour aucun gain.

Proposition retenue : les fonctions restent sur Supabase, qui est leur place, et
Vercel n'est pas utilisé. Aucune migration arbitraire n'est faite.

### 3.3 Passerelle de paiement

Aucun encaissement automatique n'existe. La console permet de déclarer un
fournisseur et le nom du secret qui porte ses clés, jamais les clés elles-mêmes.
Brancher un agrégateur suppose un contrat marchand et des identifiants réels,
qui ne sont ni disponibles ni inventables. La priorité 4 s'arrête donc à ce que
la plateforme peut honnêtement offrir aujourd'hui : transfert de compte à
compte, montant déclaré, preuve déposée, contrôle serveur des montants.

## 4. Ce qui est tenu à ce jour

Sans complaisance, et en distinguant ce qui est prouvé de ce qui ne l'est pas.

| Affirmation | Niveau |
|---|---|
| 126 tests passent, 13 fichiers | prouvé, exécuté cette session |
| Les 24 écrans se montent sans plantage | prouvé par montage réel |
| Aucun secret serveur dans le bundle | prouvé par relevé du code |
| Les 27 migrations s'enchaînent sans conflit d'ordre | prouvé par analyse de dépendances |
| Les signatures RPC du code correspondent à celles des migrations | prouvé par comparaison automatique |
| La sécurité serveur est active en base | **faux aujourd'hui**, les migrations ne sont pas appliquées |
| Une course peut aller de bout en bout en conditions réelles | **non prouvé**, cela suppose la base migrée |
| Un paiement est encaissé automatiquement | **faux**, aucune passerelle n'est branchée |
| La plateforme est déployée | **faux**, ni Cloudflare ni Vercel ne portent Akwaba |
