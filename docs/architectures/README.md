# Schémas d'architecture

Guide visuel de l'implémentation actuelle de Gmod Integration. Les vues complètent
[l'architecture détaillée](../architecture.md) et la [carte du dépôt](../README.md).
Les fonctionnalités proposées dans la [spécification v6](../v6-specification.md) restent distinctes
de l'architecture implémentée représentée ici.

Chaque schéma est affiché ci-dessous dans un bloc Mermaid, lisible sur GitHub et dans un aperçu
Markdown compatible. Son fichier `.mmd` est la source modifiable, utilisable dans un éditeur Mermaid.

| Vue                                                                           | Ce qu'elle explique                                             |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Vue globale](#1-vue-globale)                                                 | Services, clients, intégrations et stockage.                    |
| [Connexion de l'addon](#2-connexion-de-laddon)                                | Authentification, protocole WS, relais joueur et reconnexion.   |
| [Session du dashboard](#3-session-du-dashboard)                               | Session HTTP, CSRF, ticket WS et révocation.                    |
| [Flux applicatifs](#4-flux-applicatifs)                                       | Chat vers Discord et modification de configuration.             |
| [Actions Discord via BullMQ](#5-actions-discord-via-bullmq)                   | Jobs, validation, réponses corrélées et timeout.                |
| [Livraison WebSocket entre instances](#6-livraison-websocket-entre-instances) | Diffusion Redis, ACK et notifications dashboard.                |
| [Organisation du code](#7-organisation-du-code)                               | Dépendances entre apps, domaines, infrastructure et fondations. |
| [Mise en production](#8-mise-en-production)                                   | Swarm, routage, persistance, sauvegarde et migrations.          |

## 1. Vue globale

Source modifiable : [`system-overview.mmd`](./system-overview.mmd).

Les services, leurs clients et les données partagées. Le nœud `core + domain-*` représente du code
importé dans chaque processus : les flèches pointillées sont des appels locaux. Les autres flèches
montrent les échanges réseau ou les accès aux données. Les bases passent par `packages/infra-*`.

L'addon courant échange avec la passerelle WebSocket. Le dashboard utilise l'API HTTP et un ticket
pour sa connexion WS. Les actions du bot passent par BullMQ ; les publications par webhook utilisent
le relais HTTP autonome.

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    Player["Joueur Garry's Mod"]
    Lua["Serveur GMod<br/>addon Lua + GWSockets"]
    Web["Navigateur<br/>apps/website"]
  end

  subgraph Backend["Services du monorepo"]
    API["apps/api<br/>API HTTP · Express"]
    WS["apps/websocket<br/>passerelle + workers WS"]
    Bot["apps/discord<br/>bots + workers Discord"]
    Models["core + domain-*<br/>code partagé, exécuté localement"]
  end

  subgraph Data["Infrastructure partagée · packages/infra-*"]
    SQL[("MariaDB / Prisma<br/>données métier + sessions")]
    Mongo[("MongoDB<br/>journaux de jeu")]
    Redis[("Redis<br/>cache, tickets WS<br/>BullMQ, pub/sub, présence")]
    S3[("MinIO / S3<br/>captures, avatars, exports")]
  end

  subgraph External["Services externes et service autonome"]
    Discord["Discord<br/>Gateway, API, webhooks"]
    Steam["Steam Web API"]
    Relay["apps/webhook-relay<br/>HTTP autonome"]
    Store["GmodStore"]
  end

  Player -->|"net GMod · captures, rapports, erreurs"| Lua
  Lua <-->|"WSS · id + token"| WS
  Web -->|"HTTPS · session + CSRF"| API
  Web <-->|"WSS · ticket à usage unique"| WS
  Store -->|"webhooks d'achat"| API

  API -.-> Models
  WS -.-> Models
  Bot -.-> Models
  Models --> SQL
  Models --> Mongo
  Models --> S3
  Models -->|"cache / jobs BullMQ"| Redis
  Models --> Steam
  Models -->|"HTTP authentifié"| Relay

  WS <-->|"workers, pub/sub, présence, tickets"| Redis
  Bot <-->|"workers / réponses corrélées"| Redis
  Bot <-->|"discord.js"| Discord
  Relay -->|"webhooks Discord"| Discord

  classDef client fill:#eff6ff,stroke:#2563eb,color:#172554
  classDef service fill:#ecfdf5,stroke:#059669,color:#064e3b
  classDef storage fill:#fff7ed,stroke:#ea580c,color:#7c2d12
  classDef external fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95
  class Player,Lua,Web client
  class API,WS,Bot,Models service
  class SQL,Mongo,Redis,S3 storage
  class Discord,Steam,Relay,Store external
```

À lire avec [l'architecture générale](../architecture.md),
[le contrat addon](../packages/addon-transport.md) et [le relais webhook](../apps/webhook-relay.md).

## 2. Connexion de l'addon

Source modifiable : [`addon-connection.mmd`](./addon-connection.mmd).

De l'authentification du serveur dédié jusqu'au callback Lua, avec le relais des captures, rapports
et erreurs des joueurs. `method` et `endpoint` désignent une opération du protocole WS ; la passerelle
appelle directement les modèles partagés.

La déduplication est bornée à une connexion. Après une coupure, seules les requêtes encore non envoyées
et non expirées peuvent rester en attente. Un résultat `delivery_uncertain` ne permet pas de conclure
que l'opération a échoué.

```mermaid
sequenceDiagram
    participant Player as Joueur GMod (client Lua)
    participant Lua as Addon du serveur dédié (GWSockets)
    participant WS as apps/websocket + addonGateway
    participant Auth as domain-server + stockage des identifiants
    participant Core as core/models/gmod/addonTransport
    participant Infra as Domaines + bases + intégrations

    Lua->>WS: Connexion WSS<br/>En-têtes id, token, gmod-integrations-version
    WS->>Auth: Charger le serveur et valider son token
    Auth-->>WS: Serveur authentifié
    WS->>WS: Enregistrer la socket et la présence Redis
    WS-->>Lua: action = addon.ready, protocol = 1
    Note over Lua,WS: Délai de confirmation du protocole : 15 s.<br/>La connexion de transport seule ne suffit pas.

    opt Capture, rapport de bug ou erreur du joueur
        Player->>Lua: Canal net autorisé, JSON compressé en fragments
        Lua->>Lua: Valider les tailles, quotas et champs<br/>Reconstruire serveur et identité du joueur
    end

    Lua->>Lua: gmInte.api prépare la requête<br/>File FIFO bornée, au plus 4 requêtes simultanées
    Lua->>WS: addon.request (id, method, endpoint, body)
    WS->>WS: Valider le schéma et les limites
    WS->>Auth: Revérifier les identifiants à chaque requête
    Auth-->>WS: Serveur authentifié ou fermeture de connexion
    WS->>WS: Dédupliquer par id et contenu sur cette connexion

    alt Requête nouvelle et autorisée
        WS->>Core: handleAddonRequest(server, request)
        Core->>Core: Vérifier endpoint, serveur ciblé et payload
        Core->>Infra: Exécuter le modèle partagé<br/>Droits, persistance et intégrations existantes
        Infra-->>Core: Résultat de l'opération
        Core-->>WS: status + body
        WS-->>Lua: addon.response (même id, status, body)
    else Requête identique déjà connue
        WS-->>Lua: Résultat déjà calculé ou en cours
    end

    Note over WS,Core: Un id réutilisé avec un autre contenu est rejeté.<br/>Cache borné, conservé au plus 2 min pour les requêtes terminées.<br/>Après 25 s : réponse delivery_uncertain.<br/>Le travail garde sa place jusqu'à sa fin.

    Lua->>Lua: Exécuter le callback de succès ou d'échec
    opt Réponse à un outil du joueur
        Lua-->>Player: Résultat filtré, sans identifiants ni contenu privé
    end

    Note over Lua,WS: Après coupure : reconnexion exponentielle de 1 à 60 s avec aléa.<br/>Seules les requêtes non envoyées et non expirées restent en file.<br/>Une requête envoyée n'est jamais rejouée automatiquement.<br/>Changement d'identifiants : purge des requêtes en attente.
```

Sources : [gateway addon](../../apps/websocket/src/addonGateway.ts),
[dispatcher partagé](../../packages/core/src/models/gmod/addonTransport.ts) et
[contrat de transport](../packages/addon-transport.md).

## 3. Session du dashboard

Source modifiable : [`dashboard-session.mmd`](./dashboard-session.mmd).

Le dashboard commence avec une session applicative HTTP. Il récupère un jeton CSRF puis demande
un ticket WebSocket à usage unique, valable au plus 30 secondes. Redis consomme ce ticket atomiquement
avec `GETDEL` lors du handshake.

Le ticket établit l'identité de la connexion. Les sessions et les autorisations continuent d'être
vérifiées pendant son utilisation, avec révocation partagée entre les instances.

```mermaid
sequenceDiagram
    autonumber
    participant Web as Dashboard<br/>apps/website
    participant API as API HTTP<br/>apps/api
    participant WS as Passerelle WS<br/>apps/websocket
    participant DB as MariaDB<br/>infra-prisma
    participant Redis as Redis
    participant Rights as domain-user / domain-guild<br/>droits Discord

    Note over Web,API: Session applicative déjà créée : cookie HttpOnly<br/>les requêtes HTTP utilisent credentials: include
    Web->>API: GET /v6/auth/session + cookie
    API->>DB: Résoudre la session via domain-auth<br/>expiration, révocation et confidentialité
    DB-->>API: Session valide
    API-->>Web: Identité, échéances, csrfToken<br/>Cache-Control: no-store

    Web->>API: POST /v6/auth/ws-ticket<br/>cookie + X-CSRF-Token
    API->>API: Vérifier origine et CSRF
    API->>DB: Revalider la session
    DB-->>API: Session valide
    API->>Redis: SET gmi:auth:ws-ticket:hash(ticket) = sessionID<br/>EX min(30 s, durée restante de session)
    API-->>Web: ticket, expiresAt

    Web->>WS: Handshake WebSocket ?ticket=...
    WS->>WS: Vérifier l'origine
    WS->>Redis: GETDEL gmi:auth:ws-ticket:hash(ticket)
    Redis-->>WS: sessionID une seule fois, sinon null
    opt Ticket trouvé
        WS->>DB: validateApplicationSession(sessionID)
        DB-->>WS: État durable de la session
    end
    alt Ticket absent, expiré, déjà utilisé ou session invalide
        WS-->>Web: Refus HTTP 401
    else Session valide
        WS-->>Web: HTTP 101, connexion ouverte
        WS->>Rights: Charger les guildes et serveurs administrables
        Rights-->>WS: Guildes et serveurs autorisés
        WS->>DB: Revalider la session avant utilisation
        Note over Web,WS: L'ouverture du transport précède les contrôles initiaux de droits<br/>la passerelle peut encore fermer la connexion
    end

    loop Message serveur reçu ou push vers le dashboard
        WS->>DB: Revalider session, expiration et confidentialité
        WS->>Redis: Lire la révision courante des droits
        opt Révision modifiée, invalidation reçue ou cache de 30 s expiré
            WS->>Rights: Recharger les droits
            Rights-->>WS: Guildes et serveurs autorisés
        end
        WS->>WS: Vérifier l'accès au serverID concerné
        WS-->>Web: Réponse ou push si autorisé
    end

    opt Déconnexion ou révocation de session par HTTP
        Web->>API: POST /v6/auth/logout<br/>cookie + X-CSRF-Token
        API->>DB: revoke = true<br/>session et délégations associées
        API->>Redis: PUBLISH gmi:auth:session-revoked
        Redis-->>WS: Notification à chaque réplique
        WS-->>Web: Fermer la connexion, code 1008
        API-->>Web: revoked: true, effacer le cookie
    end

    Note over WS,DB: MariaDB reste l'autorité si une notification est manquée
    loop Au plus toutes les 60 s, ou plus tôt à l'échéance de session
        WS->>DB: validateApplicationSession(sessionID)
        DB-->>WS: Session actuelle
        opt Session expirée ou révoquée
            WS-->>Web: Fermer la connexion, code 1008
        end
    end

    Note over Web,WS: Après une fermeture 1008, le navigateur relit la session HTTP<br/>chaque tentative de reconnexion exige un nouveau ticket
```

Sources : [sessions et tickets](../../packages/domain-auth/src/authSessions.ts),
[passerelle WebSocket](../../apps/websocket/src/main.ts) et
[cycle de vie des connexions](../apps/websocket.md).

## 4. Flux applicatifs

Source modifiable : [`request-flow.mmd`](./request-flow.mmd).

Deux parcours concrets : un message de chat en jeu envoyé à Discord, puis un réglage `ig_*` modifié
depuis le dashboard. Le premier utilise le relais webhook ; le second sauvegarde la configuration
en transaction avant de demander sa synchronisation au serveur de jeu.

`sync: pending` signifie que l'application du réglage en jeu reste à confirmer. Une sauvegarde validée
en base reste valide même si l'invalidation du cache ou la mise en file échoue.

```mermaid
sequenceDiagram
    autonumber
    participant Lua as Addon GMod
    participant WS as apps/websocket
    participant Core as core / domain-*<br/>(code local)
    participant DB as MariaDB / MongoDB
    participant Relay as apps/webhook-relay
    participant Discord as Discord
    participant Web as Dashboard
    participant API as apps/api
    participant Queue as Redis / BullMQ

    Note over Lua,Discord: 1. Chat en jeu vers Discord · connexion addon déjà prête
    Lua->>WS: addon.request {id, method: POST, endpoint, body}
    WS->>WS: Revalider les identifiants<br/>Valider contrat et limites
    WS->>Core: handleAddonRequest(server, request)
    Core->>DB: Journaliser l'événement<br/>Lire les réglages applicables
    opt Sync autorisée, canal configuré<br/>et message accepté
        Core->>Relay: POST authentifié · message filtré
        Relay->>Discord: WebhookClient.send(message)
        Discord-->>Relay: Résultat de publication
        Relay-->>Core: Succès ou échec HTTP
    end
    Core-->>WS: Résultat métier {status, body}
    WS-->>Lua: addon.response {id, status, body}
    Note over WS,Core: Les endpoints désignent des opérations WS<br/>exécutées dans le processus WS

    Note over Lua,Queue: 2. Modification d'un réglage ig_* depuis le dashboard
    Web->>API: Mutation HTTP<br/>session, CSRF et autorisations
    API->>Core: saveServerDashboardSettings<br/>(server, settings)
    Core->>Core: Valider schéma et droits<br/>de modification
    Core->>DB: Transaction Prisma · enregistrer les réglages
    DB-->>Core: Transaction validée
    Core->>Queue: Invalider le cache<br/>Ajouter wsSendToServer / wsEditSetting
    Core-->>API: Réglages sauvegardés, sync: pending
    API-->>Web: Confirmation de sauvegarde
    opt Commande remise à une passerelle<br/>et socket addon disponible
        Queue->>WS: Worker consomme wsSendToServer
        WS->>Lua: wsEditSetting · livraison locale ou via pub/sub
    end
    Note over Web,Queue: L'enregistrement reste valide<br/>si la synchronisation échoue
    Note over Lua,WS: La livraison au socket ne confirme pas<br/>l'application du réglage en jeu
```

Sources : [dispatch des événements addon](../../packages/core/src/models/gmod/addonTransport.ts),
[chat vers Discord](../../packages/core/src/models/v3/serversPlayersModels.ts) et
[sauvegarde des réglages](../../packages/core/src/models/v6/dashboardSettings.ts).

## 5. Actions Discord via BullMQ

Source modifiable : [`discord-bullmq-bridge.mmd`](./discord-bullmq-bridge.mmd).

Les appels `enqueueDiscordX(...)` permettent à l'API et aux modèles métier de demander une action
au processus qui possède le client Discord. Les contrats Zod sont partagés entre producteur et worker.

Pour les opérations avec réponse, l'appelant lit une clé Redis corrélée, conservée 30 secondes.
Un timeout arrête l'attente de l'appelant ; le job peut encore s'exécuter. Certaines synchronisations
attendent uniquement la mise en file.

```mermaid
sequenceDiagram
    autonumber
    participant Caller as API / core / domain-*
    participant Adapter as infra-bullmq<br/>discordQueueAdapters
    participant Queue as File BullMQ<br/>Redis
    participant Worker as apps/discord<br/>worker
    participant Client as Client Discord actif<br/>bot principal ou personnalisé
    participant Reply as Redis<br/>clé de réponse

    Caller->>Adapter: enqueueDiscordX(données, timeoutMs)
    Adapter->>Adapter: Créer correlationId et valider JobSchema
    Note over Adapter,Worker: Contrats partagés : packages/schema/src/bullmq.ts
    Adapter->>Queue: queue.add(nom, payload, options)

    par Exécution du job
        Queue->>Worker: Livrer le job au worker concerné
        Worker->>Worker: Valider le payload avec JobSchema
        Worker->>Client: Exécuter l'opération Discord
        Client-->>Worker: Résultat ou erreur métier
        Worker->>Reply: SET bullmq:reply:correlationId<br/>JSON, expiration 30 s
    and Attente du résultat côté appelant
        loop Toutes les 100 ms, jusqu'à réponse ou timeoutMs
            Adapter->>Reply: GET bullmq:reply:correlationId
            Reply-->>Adapter: JSON si disponible, sinon null
        end
    end

    alt Réponse reçue
        Adapter->>Reply: DEL bullmq:reply:correlationId
        Adapter->>Adapter: JSON.parse puis validation ReplySchema
        Adapter-->>Caller: Résultat typé ou erreur métier
    else Délai dépassé
        Adapter-->>Caller: BullMQReplyTimeoutError
        Note over Caller,Worker: Le timeout de l'appelant n'annule pas le job
    end

    Note over Adapter,Queue: Certaines synchronisations sont sans réponse :<br/>l'appelant attend uniquement la mise en file
```

Sources : [adaptateurs Discord](../../packages/infra-bullmq/src/discordQueueAdapters.ts),
[workers Discord](../../apps/discord/src/discord/workers/discordQueueWorkers.ts) et
[contrats de jobs](../../packages/schema/src/bullmq.ts).

## 6. Livraison WebSocket entre instances

Source modifiable : [`websocket-delivery.mmd`](./websocket-delivery.mmd).

Chaque instance de la passerelle possède ses sockets en mémoire. BullMQ confie un job à un worker ;
si la socket du serveur est ailleurs, Redis pub/sub relaie la demande et une clé ACK signale l'envoi.
Pour les dashboards, chaque instance traite la diffusion sur ses propres connexions autorisées.

L'ACK indique une écriture sur la socket. L'exécution d'une commande RCON exige en plus un
`addon.command-result` corrélé. Les notifications dashboard utilisent pub/sub sans rejeu ni accusé
de réception du navigateur : un client déconnecté peut manquer une notification.

```mermaid
sequenceDiagram
    participant Producer as API / Discord / packages métier
    participant Q as BullMQ (Redis)
    participant W1 as Passerelle WS - réplique A
    participant PubSub as Redis Pub/Sub + clés ACK
    participant W2 as Passerelle WS - réplique B
    participant Server as Addon du serveur GMod
    participant Dashboard as Dashboard connecté

    Producer->>Q: wsSendToServerQueue.add(id, data)
    Q->>W1: Un worker consomme le job
    W1->>W1: Revérifier les droits de la commande<br/>Chercher la socket locale

    alt Serveur connecté à la réplique A
        W1->>Server: ws.send(data)
        W1-->>Q: Résultat du job = true
    else Aucune socket locale
        W1->>PubSub: SET ws:send-to-server:ack:requestId = 0 (TTL 5 s)
        W1->>PubSub: PUBLISH ws:send-to-server:broadcast<br/>id, data, requestId
        PubSub-->>W2: Diffusion aux répliques abonnées
        W2->>W2: Revérifier les droits<br/>Chercher la socket locale
        opt Serveur connecté à la réplique B et commande autorisée
            W2->>Server: ws.send(data)
            W2->>PubSub: INCR clé ACK + EXPIRE 5 s
        end
        loop Lecture toutes les 60 ms, au plus 600 ms
            W1->>PubSub: GET clé ACK
            PubSub-->>W1: Compteur de livraison
        end
        W1->>PubSub: DEL clé ACK
        W1-->>Q: true si ACK reçu, sinon false
    end

    Note over Q,Server: Ce résultat confirme une écriture sur la socket.<br/>RCON exige en plus addon.command-result<br/>corrélé au serveur et à la commande.

    Producer->>Q: wsSendToAllClientsOfServerQueue.add(id, action, data)
    Q->>W1: Un worker consomme le job
    W1->>PubSub: PUBLISH ws:send-to-clients:broadcast
    PubSub-->>W1: Diffusion à la réplique A
    PubSub-->>W2: Diffusion à la réplique B
    W1->>W1: Revérifier sessions et droits des clients locaux
    W2->>W2: Revérifier sessions et droits des clients locaux
    opt Dashboard autorisé connecté à la réplique B
        W2-->>Dashboard: Événement temps réel (action, serverID, data)
    end

    Note over W1,Dashboard: Chaque réplique envoie uniquement à ses clients locaux.<br/>Le chemin Pub/Sub évite un double envoi local.<br/>Une publication ne confirme pas la réception par le navigateur.
```

Sources : [workers et diffusion WS](../../apps/websocket/src/main.ts),
[files WebSocket](../../packages/infra-websocket/src/queues.ts) et
[résultats des commandes addon](../../packages/infra-websocket/src/addonCommands.ts).

## 7. Organisation du code

Source modifiable : [`package-dependency-layers.mmd`](./package-dependency-layers.mmd).

Les flèches représentent des imports entre groupes de packages. Une flèche signifie qu'au moins
un membre du groupe importe un membre du groupe cible ; cette vue regroupe les dépendances pour
rester lisible. Les appels réseau entre services sont représentés dans les autres vues.

Les entrées `apps/*` composent le code partagé. Les imports ciblés de `compliance` et `moderation`
vers `core` existent actuellement et figurent en pointillés. Le relais webhook utilise sa propre
configuration et n'importe aucun package `@gmod/*`.

```mermaid
flowchart TB
    subgraph Apps["Points d'entrée — apps/*"]
        Backend["api · discord · websocket<br/>routes, connexions et workers"]
        Website["website<br/>SolidJS / Vite"]
        Relay["webhook-relay<br/>autonome, env propre<br/>aucun import @gmod/*"]
        Docs["docs<br/>Docusaurus, documentation produit"]
    end

    subgraph Business["Logique partagée — packages/*"]
        Special["domain-compliance · domain-moderation"]
        Core["core<br/>orchestration et modèles applicatifs"]
        Domains["domain-server · domain-guild · domain-user<br/>domain-gmod · domain-access · domain-auth"]
    end

    subgraph Infrastructure["Adaptateurs techniques"]
        Infra["infra-prisma · infra-mongo · infra-redis<br/>infra-bullmq · infra-websocket<br/>infra-minio · infra-steam · infra-geoip"]
    end

    subgraph Foundations["Fondations"]
        Shared["shared<br/>validation, jetons, logs"]
        Schema["schema<br/>contrats Zod, sans dépendance métier"]
        Config["config<br/>env et validation<br/>getters infrastructure isolés"]
    end

    Backend --> Core
    Backend --> Domains
    Backend --> Special
    Backend --> Infra
    Special --> Domains
    Special --> Infra
    Special -. "imports ciblés existants : export / localisation" .-> Core
    Core --> Domains
    Core --> Infra
    Core --> Shared
    Core --> Schema
    Core --> Config
    Domains --> Infra
    Domains --> Shared
    Domains --> Schema
    Domains --> Config
    Infra --> Schema
    Infra --> Config
    Shared --> Config
    Website --> Schema
    Website -->|"config/website, compatible navigateur"| Config

    classDef standalone fill:#fef3c7,stroke:#b45309,color:#422006
    classDef base fill:#e0f2fe,stroke:#0369a1,color:#0c4a6e
    class Relay,Docs standalone
    class Shared,Schema,Config base
```

À lire avec [les règles de dépendances](../architecture.md#allowed-dependencies),
[la carte des packages](../README.md) et
[le contrôle automatique d'architecture](../../scripts/check-architecture.ts).

## 8. Mise en production

Source modifiable : [`deployment-topology.mmd`](./deployment-topology.mmd).

La topologie correspond à la stack Swarm versionnée et au régime attendu après une release réussie :
API et passerelle WS à deux instances par défaut, configurables, et bot Discord à une seule instance.
Traefik publie le port 80 ; les ports des services et des bases restent sur le réseau privé.

La stack laisse initialement les trois applications à zéro instance. Pour une installation existante,
le wrapper de déploiement arrête les écritures, effectue une sauvegarde à froid puis lance
`prisma migrate deploy`. Le premier déploiement avec `--bootstrap` saute la sauvegarde préalable. Il active les
applications après réussite et les laisse arrêtées en cas d'échec de migration. Les volumes locaux
imposent le placement des services de données sur leur manager propriétaire.

Le site web, la documentation produit et le relais webhook ont un hébergement séparé, absent de cette
stack. Cette vue décrit la configuration du dépôt, pas l'état réel d'un hôte. La topologie physique
Proxmox reste à documenter : aucune définition Terraform `.tf` n'est disponible dans ce dépôt.

```mermaid
%% Sources : docker-stack.swarm.yml, scripts/swarm-ops.py, docs/deployment/swarm.md.
%% Configuration versionnée ; ne décrit pas l'état d'un hôte en production.
flowchart TB
  CLIENTS["Dashboard / addon GMod"]
  TUNNEL["Cloudflare Tunnel<br/>HTTPS / WSS"]

  subgraph SWARM["Docker Swarm — réseau privé gmod_net"]
    TRAEFIK["Traefik ×1<br/>port publié : 80"]

    subgraph BACKEND["Services actifs après une release réussie"]
      API["API ×2 par défaut<br/>53136 privé"]
      WS["WebSocket ×2 par défaut<br/>53139 privé"]
      BOT["Discord ×1<br/>bot + workers"]
    end

    subgraph DATA["Données — 1 instance par service, aucun port publié"]
      MARIA[("MariaDB<br/>3306")]
      REDIS[("Redis<br/>6379")]
      MONGO[("MongoDB<br/>27017")]
      MINIO[("MinIO<br/>S3 : 9000<br/>console : 9001")]
    end

    VOLUMES["4 volumes persistants<br/>manager propriétaire"]
    MIGRATE["Migration ponctuelle<br/>prisma migrate deploy"]
  end

  RELEASE["Release contrôlée<br/>scripts/swarm-deploy.sh"]
  EXTERNAL["Hébergement séparé<br/>website, docs, webhook-relay"]
  DISCORD["Discord Gateway / API"]

  CLIENTS -->|"API_HOST / WS_HOST"| TUNNEL
  TUNNEL -->|"HTTP :80, Host conservé"| TRAEFIK
  TRAEFIK -->|"API_HOST"| API
  TRAEFIK -->|"WS_HOST"| WS
  BACKEND -->|"packages infra-*"| DATA
  DATA -->|"persistance locale"| VOLUMES
  BOT <-->|"connexions sortantes"| DISCORD
  RELEASE -.->|"après sauvegarde, sauf bootstrap"| MIGRATE
  MIGRATE --> MARIA
  RELEASE -.->|"activation si migration réussie"| BACKEND

  classDef client fill:#eff6ff,stroke:#2563eb,color:#172554
  classDef service fill:#ecfdf5,stroke:#059669,color:#064e3b
  classDef storage fill:#fff7ed,stroke:#ea580c,color:#7c2d12
  classDef external fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95
  class CLIENTS client
  class TRAEFIK,API,WS,BOT,MIGRATE service
  class MARIA,REDIS,MONGO,MINIO,VOLUMES storage
  class TUNNEL,RELEASE,EXTERNAL,DISCORD external
```

Sources : [stack Swarm](../../docker-stack.swarm.yml),
[orchestration des releases](../../scripts/swarm-ops.py) et
[guide de déploiement et de reprise](../deployment/swarm.md).

## Mise à jour des schémas

Lorsqu'un flux, une frontière de package ou le déploiement change, modifier le fichier `.mmd` et son
bloc Mermaid dans cette page dans la même modification. Leur contenu doit rester identique.
Le bloc de flux applicatifs présent dans [architecture.md](../architecture.md#end-to-end-data-flow)
doit également rester identique à `request-flow.mmd`.

Vérifier les flèches et les garanties dans le code source lié, puis contrôler le rendu Mermaid.
Conserver les noms de variables de configuration plutôt que les valeurs propres à un environnement.
