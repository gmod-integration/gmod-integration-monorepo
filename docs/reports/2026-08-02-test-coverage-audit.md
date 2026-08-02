# Rapport de couverture de tests — gmod-integration

- **Date:** 2026-08-02
- **Requested by / context:** audit demandé par l'utilisateur sur l'état réel de la couverture de tests du
  projet.
- **Status:** Open — recommandations non encore appliquées.

## TL;DR

La couverture de tests réelle du projet est de ~0%. Il existe 3 fichiers de test qui ne testent que 7
endpoints "happy path" de l'API v3, et cette suite est actuellement cassée (import vers un fichier qui
n'existe plus). Le dashboard (SolidJS), tous les packages métier (`packages/domain-*`, `packages/infra-*`),
l'app Discord et l'app Websocket n'ont strictement aucun test. Aucun test n'est exécuté en CI.

## 1. Ce qui existe

| Élément | État |
| --- | --- |
| Fichiers de test | 3 fichiers, dans `test/api/` |
| Framework de test | `node:test` natif (pas de Vitest/Jest configuré nulle part) |
| Script `test` dans un `package.json` | Aucun (racine, ni aucun des 17 workspaces) |
| Tâche `test` dans `turbo.json` | Absente (seules `build`, `dev`, `typecheck`, `lint` existent) |
| Étape de test en CI (`.github/workflows/build.yml`) | Absente — le workflow ne fait que : scan SonarQube statique + build/push des images Docker |
| Couverture de code mesurée (coverage report, seuils) | Inexistante |

### Détail des 3 fichiers de test

- `test/api/mainController.test.ts` — `GET /v3`, `GET /v3/stats` (2 tests, vérifient juste le status 200)
- `test/api/userController.test.ts` — `GET /v3/users/:discordID`, `.../guilds`, `.../guilds/:guildID`
  (3 tests, status 200 uniquement)
- `test/api/serverController.test.ts` — `GET /v3/servers/:serverID`, `POST .../public-token` (2 tests)

Aucun test n'exerce un cas d'erreur, une validation, un rôle/permission, ou une charge utile (body). Ce sont
des smoke tests superficiels, pas des tests fonctionnels.

### 🔴 La suite est cassée dès l'exécution

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'/home/linventif/gmod-integration/scripts/seed/config.js'
imported from /home/linventif/gmod-integration/test/index.ts
```

- `test/index.ts` et 2 des 3 fichiers de test importent `../scripts/seed/config.js`, un chemin qui n'existe
  plus depuis le refactor "move seed scripts to test directory" (le fichier a été déplacé vers
  `test/seed/config.ts`).
- Même en corrigeant le chemin, les imports nommés (`testUser`, `testServer`) n'existent pas dans
  `test/seed/config.ts` — les exports actuels sont `devUser`, `devServer`, `devGuild`, etc.
- Conclusion : personne n'a fait tourner cette suite avec succès depuis au moins ce refactor, et elle ne peut
  pas tourner en l'état.

## 2. Ce qui n'est pas testé

### API (`apps/api`)

- 156 endpoints définis dans les routes (`router.get/post/put/delete/patch`) → 7 testés (4,5%), et ces 7 sont
  down actuellement.
- 13 contrôleurs, dont `usersControllers.ts` (1323 lignes, logique la plus critique : gestion utilisateurs,
  admin, bans...) → 0 test direct sur la logique métier du contrôleur (juste 3 GET couverts indirectement en
  E2E).
- Aucun test sur : middlewares (`clientValidator`, `serverValidator`, `userValidator`, `errorMiddleware`,
  `rawBodyMiddleware`), les webhooks Gmod Store (paiements/achats), les routes bans, clients, guilds, steam.
- Aucun test d'authentification/autorisation (tokens invalides, permissions insuffisantes, IDOR potentiel).
- Aucun test d'erreur (4xx/5xx), de validation de payload, ou de cas limites.

### Dashboard (`apps/website`, SolidJS + Vite)

- 0 fichier de test, 0 framework installé (pas de Vitest, pas de `@solidjs/testing-library`, pas de
  Playwright/Cypress).
- ~94 fichiers `.ts`/`.tsx`, ~12 000 lignes de code, dont 37 pages/composants rien que dans
  `src/pages/dashboard/` : gestion de guilde, rôles auto, vérifications, config serveur, logs, screenshots,
  statuts, chat, bans, votes, équipe, joueurs...
- Aucun test unitaire de composant, aucun test d'intégration, aucun test end-to-end sur le parcours
  utilisateur (login, navigation, actions CRUD).

### Packages métier partagés (`packages/*`)

~11 400 lignes de logique métier et d'infrastructure, 0 test :

| Package | Lignes | Rôle |
| --- | --- | --- |
| `core` | 4 645 | noyau applicatif |
| `domain-server` | 1 590 | logique serveurs Gmod |
| `schema` | 1 108 | schémas Zod (validation) |
| `domain-guild` | 1 251 | logique guildes Discord |
| `infra-bullmq` | 1 071 | files de jobs (queue système) |
| `domain-gmod` | 352 | intégration Gmod |
| `domain-moderation` | 293 | modération (bans, warns) |
| `domain-user` | 256 | logique utilisateurs |
| `domain-compliance` | 253 | conformité |
| `config` | 300 | configuration |
| `infra-minio` | 173 | stockage objets |
| autres infra (mongo, prisma, redis, steam, websocket) | ~156 | intégrations externes |

C'est la couche qui contient le plus de règles métier réutilisées par l'API, le bot Discord et le websocket —
et c'est la moins protégée.

### Autres apps

- `apps/discord` (~4 641 lignes, bot Discord) : 0 test
- `apps/websocket` (~372 lignes) : 0 test

## 3. Pourquoi c'est risqué

- **Régressions invisibles** : toute modification dans `usersControllers.ts`, dans un package `domain-*`, ou
  dans un composant dashboard peut casser une fonctionnalité sans qu'aucun signal ne se déclenche avant la
  prod.
- **SonarQube tourne mais mesure du vide** : le scan statique en CI (`build.yml`) ne remplace pas des tests —
  il ne détecte ni régression fonctionnelle ni bug de logique métier.
- **Faux sentiment de sécurité** : la présence d'un dossier `test/` peut laisser croire qu'il y a une suite
  active, alors qu'elle est cassée et n'a jamais couvert que 4,5% des endpoints.
- **Zone à fort risque non couverte** : le webhook Gmod Store (paiements) et les contrôleurs admin (bans,
  impersonation) sont parmi les zones les plus sensibles et n'ont aucun test.

## Recommandation

Par ordre de priorité :

1. **Réparer ou supprimer la suite existante** — dans l'état, un dossier de tests cassé qui n'apparaît dans
   aucun script ni CI n'apporte de valeur et induit en erreur. Décider : la corriger (chemins + exports) et
   l'intégrer au CI, ou l'assumer comme dette et la retirer en attendant mieux.
2. **Ajouter une étape de test au CI (`build.yml`)** — sans ça, même de bons tests écrits localement ne seront
   jamais appliqués comme garde-fou.
3. **Prioriser les packages `domain-*` pour des tests unitaires** — c'est la logique métier centrale, partagée
   entre 3 apps, avec le meilleur ratio effort/valeur (pas besoin de DB/serveur pour la tester en grande
   partie).
4. **Ajouter un framework de test au dashboard** (Vitest + `@solidjs/testing-library` est le choix naturel
   pour SolidJS/Vite) en commençant par les composants avec logique (formulaires, sélecteurs, config serveur)
   plutôt que le pur affichage.
5. **Étendre les tests API au-delà des GET happy-path** : cas d'erreur, auth/permissions, contrôleurs admin
   et webhook Gmod Store en priorité vu leur sensibilité.

## Outcome

Not yet acted on.

## Annexe — méthodologie

- Comptage des endpoints : `grep -rhoE "router\.(get|post|put|delete|patch)\(" apps/api/src/routes`
- Comptage des lignes : `find ... -name "*.ts" | xargs wc -l` (packages générés/node_modules/dist exclus)
- Vérification de l'exécution réelle de la suite existante via `node --experimental-strip-types test/index.ts`
- Recherche de scripts/tâches de test : `package.json` (racine + 17 workspaces), `turbo.json`,
  `.github/workflows/`
