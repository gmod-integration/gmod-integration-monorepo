# Migration Playbook

Guide pour déplacer du code de `apps/*` vers `packages/*` sans casser l’architecture.

## Checklist de migration

1. Identifier le code “shared” (réutilisable par api/discord/ws).
2. Choisir le package cible:
   - métier -> `domain-*`
   - applicatif transverse -> `core`
   - technique -> `infra-*`
   - contrat/validation -> `schema`
3. Déplacer les fichiers + corriger les imports en chemin package (`@gmod/...`).
4. Supprimer les anciens wrappers/re-exports inutiles dans `apps/api/src/...`.
5. Vérifier qu’aucun package n’importe un fichier dans `apps/*`.
6. Vérifier les cycles Turbo (dependency graph).
7. Lancer lint + typecheck + dev ciblé.

## Exemple: action Discord depuis API

Objectif: ne pas appeler Discord directement.

1. Ajouter le schéma job/reply dans `packages/schema/src/bullmq.ts`.
2. Ajouter l’adapter dans `packages/infra-bullmq/src/discordQueueAdapters.ts`.
3. Implémenter le worker dans `apps/discord/src/discord/workers/discordQueueWorkers.ts`.
4. Remplacer les anciens appels directs dans `apps/api` / `packages/core`.

## Exemple: ajout d’un champ sur `req`

1. Déclarer le champ dans `packages/core/src/types/express.d.ts`.
2. S’assurer que le `tsconfig` inclut bien ce dossier de types.
3. Setter la valeur dans middleware.
4. Consommer sans cast unsafe dans controllers/models.

## Gestion des cycles

Si Turbo signale un cycle entre domain packages:

1. Sortir les types/fonctions partagés vers un package neutre (`core` ou nouveau package dédié).
2. Éviter la dépendance réciproque domain A <-> domain B.
3. Remplacer les appels directs par un contrat (schema + event/job) quand nécessaire.

## Definition of done (DoD)

- Les imports pointent vers `@gmod/*`, pas vers des chemins d’app.
- Les controllers sont minces, logique extraite.
- Pas de cycle package.
- `lint`, `typecheck`, et lancement dev de l’app concernée passent.
