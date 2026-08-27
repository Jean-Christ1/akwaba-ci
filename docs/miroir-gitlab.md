# Miroir GitLab

Le dépôt vit sur GitHub (`Jean-Christ1/akwaba-ci`, privé) et est mis en miroir
intégral sur GitLab (`Armand_isds2021/akwaba-ci`, privé).

## Ce que « miroir intégral » veut dire

Les mêmes commits, sous les mêmes empreintes, sur les mêmes branches, avec la
même branche par défaut et la même visibilité. Pas « le même dernier état » :
tout l'historique, soit 275 commits et plus, depuis le gabarit initial de
janvier 2025.

GitHub reste la source. GitLab est la copie. Les poussées vont de la source
vers la copie, jamais l'inverse : deux dépôts où l'on écrit des deux côtés ne
sont pas des miroirs, ce sont deux projets qui divergent.

## Ce qui a été vérifié avant la première poussée

Pousser un historique vers une plateforme nouvelle republie chaque objet qu'il
contient, y compris ceux qu'un commit ultérieur a supprimés. Avant la première
poussée, `scripts/audit-historique-secrets.mjs` a lu chaque blob de chaque
commit :

- Aucun secret dans l'historique complet. Le seul jeton présent est la clé
  Supabase « anon », publique par conception et protégée par RLS ; la clé
  `service_role` n'apparaît nulle part.
- Un fichier `.env` a été commité en mai 2026 : il ne contenait que l'URL du
  projet, son identifiant et la clé anon, tous trois publics par construction
  (toute variable `VITE_*` est incorporée au paquet livré au navigateur).
- L'historique porte des commits signés « Lovable » et « gpt-engineer-app » :
  ce sont les auteurs réels des premiers commits du gabarit. Les réécrire
  changerait chaque empreinte de l'historique et casserait le miroir avec
  GitHub. Ils restent.

Ce contrôle tourne désormais à chaque pipeline, des deux côtés : un secret
entré serait republié deux fois, et le retirer d'un seul côté ne le
retirerait pas de l'autre.

## Lancer le miroir

```
node scripts/gitlab-etat.mjs            # ce que GitLab sait déjà
node scripts/audit-historique-secrets.mjs   # doit être vert
node scripts/gitlab-miroir.mjs          # créer, pousser, vérifier
node scripts/gitlab-miroir.mjs --verifier   # vérifier sans pousser
```

Le script est idempotent : relancé, il retrouve le projet, repousse ce qui
manque et refait la vérification. Il ne force jamais. Une divergence doit se
voir et se décider, pas s'écraser en silence.

La vérification compare référence par référence l'empreinte de la source et
celle de la copie, dans les deux sens : une branche absente de GitLab est un
écart, une branche en trop sur GitLab en est un aussi.

## L'intégration continue des deux côtés

`.gitlab-ci.yml` est le port fidèle de `.github/workflows/ci.yml` : mêmes
portes, mêmes seuils, même tolérance en l'absence de secrets. Une chaîne plus
permissive d'un côté ferait entrer par GitLab ce que GitHub refuse.

Les recettes contre la base réelle exigent les variables `SUPABASE_DB_*` dans
les réglages CI/CD du projet GitLab (voir `scripts/lib/connexion-base.mjs`).
Sans elles, chaque recette s'ignore d'elle-même et le dit : une absence de
configuration ne doit pas passer pour un défaut du produit. Les recettes
partagent un `resource_group` : elles ne s'exécutent jamais deux en parallèle
sur la même base.

## Entretien

Après chaque promotion vers `main` ou poussée sur `develop` :

```
node scripts/gitlab-miroir.mjs
```

La conformité se lit dans la dernière ligne : « MIROIR CONFORME » ou la liste
des écarts. Ne jamais pousser directement sur GitLab : toute écriture passe
par GitHub d'abord.
