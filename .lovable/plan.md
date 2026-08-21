## Objectif

Compléter Akwaba avec : promotion admin sans SQL, page /profil enrichie, back-office partenaire structuré, et inscription partenaire avec fiche détaillée.

## 1. Promotion admin sans SQL

**Problème** : actuellement il faut exécuter `INSERT INTO user_roles` manuellement. RLS exige déjà un admin pour promouvoir.

**Solution** : Edge Function `bootstrap-admin` (publique) qui :
- Vérifie qu'**aucun admin n'existe encore** dans `user_roles`
- Si oui, accepte un `user_id` + un secret `BOOTSTRAP_ADMIN_TOKEN` et insère le rôle admin via service role
- Une fois un admin créé, la fonction refuse tout nouvel appel

**Puis dans `/admin` (onglet Utilisateurs)** : tout admin peut promouvoir via UI (déjà partiellement en place — on ajoute la recherche par UID + email + bouton "Révoquer").

→ Workflow simple : tu colles ton user_id sur une page `/admin/bootstrap` une seule fois. Ensuite tout se fait via UI.

## 2. Page `/profil` enrichie

Refonte de `ProfilePage` pour afficher :
- Rôle(s) (badges) + statut (vérifié partenaire / utilisateur / admin)
- Carte "Mon compte" : nom, email, téléphone (édition `profiles`)
- Carte "Sécurité" : changer mot de passe, déconnexion
- Section "Mes demandes" (déjà présente, à garder)
- Section "Devenir partenaire" (CTA vers `/partner/signup`) si pas encore partenaire
- Lien "Espace partenaire" si rôle partner/admin/moderator

## 3. Back-office partenaire structuré

Refonte de `/admin` :
- Layout avec sidebar (`SidebarProvider`) — sections : Tableau de bord, Mes fiches, Demandes/Leads, Messages, Modération (mod+), Utilisateurs (admin)
- **Tableau de bord** : KPI cards (nb fiches publiées/brouillon, leads new/in_review, taux de conversion)
- **Mes fiches** : table existante + filtres statut/type
- **Demandes** : table existante + drawer détail lead (nom, contact, dates, message, note partenaire éditable)
- **Messages** : zone de notes/threads par lead (réutilise `partner_note` pour MVP)
- **Modération** : preview fiche pending + approve/reject
- **Utilisateurs** : recherche par email/UID, attribuer/retirer rôles partner/moderator/admin

Contrôle d'accès strict par onglet (`isPartner` / `isModerator` / `isAdmin`).

## 4. Inscription partenaire détaillée

Nouveau parcours `/partner/signup` (multi-étapes) :
1. **Compte** : si non connecté → signup email/password ; sinon skip
2. **Type d'établissement** : hôtel, restaurant, maquis, attraction, plage, nightlife, culture, shopping
3. **Identité** : nom commercial, slug auto, tagline, description, story
4. **Localisation** : ville, zone, adresse, lat/lng (input manuel pour MVP)
5. **Contact** : téléphone, whatsapp, email, site web
6. **Détails** : standing (1-5), price_band, services (multi-tag), tags, cuisines (si resto), why_visit, best_for, best_time, average_duration, practical_tips
7. **Médias** : upload image principale + galerie vers bucket `place-images`
8. **Soumission** : crée la fiche en `status='pending'` + assigne rôle `partner` à l'utilisateur (via Edge Function `register-partner` en service role) + envoie en file de modération

Migration DB nécessaire : Edge Function `register-partner` qui assigne le rôle `partner` automatiquement au premier établissement créé (sinon RLS bloque l'INSERT places, qui exige déjà le rôle partner).

## Détails techniques

**Edge Functions à créer :**
- `bootstrap-admin` (public, one-shot) — promotion admin initiale
- `register-partner` (auth required) — assigne rôle partner + crée la fiche en pending

**Routes ajoutées :**
- `/admin/bootstrap` — UI pour première promotion admin
- `/partner/signup` — formulaire multi-étapes
- `/profil` — refonte

**Composants nouveaux :**
- `src/pages/admin/AdminLayout.tsx` (sidebar)
- `src/pages/admin/DashboardPage.tsx`
- `src/pages/admin/UsersPage.tsx`
- `src/pages/partner/PartnerSignupPage.tsx` (avec sous-étapes)
- `src/pages/admin/BootstrapAdminPage.tsx`

**Secret à ajouter** : `BOOTSTRAP_ADMIN_TOKEN` (token aléatoire, fourni à l'utilisateur une fois)

**Storage** : bucket `place-images` déjà OK (public).

## Hors périmètre

- OAuth Google (reporté à ta demande)
- Notifications email partenaire (déjà en place via `submit-lead` Resend)
- Système de chat temps réel (les "messages" se limitent à `partner_note` pour MVP)
