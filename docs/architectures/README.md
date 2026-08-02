# Architecture Diagrams

Visual companions to [docs/architecture.md](../architecture.md). Each diagram has a `.mmd` source file in
this folder (Mermaid syntax — open it directly in the
[Mermaid Live Editor](https://mermaid.live), a Mermaid-aware IDE plugin, or any tool that renders `.mmd`) and
is also embedded below in a fenced code block so it renders inline on GitHub/GitLab and in this doc viewer.

If you change something these diagrams describe (a queue, a boundary, a deployment topology), update the
`.mmd` file **and** the copy embedded below — they must stay identical, keep them in sync in the same commit.

## 1. System overview

Source: [`system-overview.mmd`](./system-overview.mmd)

What talks to what: the GMod addon and the dashboard as clients, the three runtime apps, the data stores each
one owns, and the external services (Discord, Steam).

```mermaid
graph TD
  subgraph Clients
    Lua["GMod Addon (Lua)<br/>submodules/gmod-integration"]
    Dash["Website Dashboard<br/>apps/website"]
  end

  subgraph Apps["apps/*"]
    API["apps/api<br/>Express HTTP"]
    WS["apps/websocket<br/>WS gateway"]
    DISCORD["apps/discord<br/>bot + BullMQ workers"]
  end

  subgraph Data["Data stores (packages/infra-*)"]
    Maria[("MariaDB<br/>infra-prisma")]
    Mongo[("MongoDB<br/>infra-mongo")]
    Redis[("Redis<br/>infra-redis / infra-bullmq")]
    Minio[("MinIO S3<br/>infra-minio")]
  end

  subgraph External
    DiscordAPI["Discord Gateway/API"]
    SteamAPI["Steam Web API<br/>infra-steam"]
  end

  Lua -->|"HTTP (server token/id)"| API
  Lua <-->|"WebSocket (server token/id)"| WS
  Dash -->|"HTTP (panel session)"| API
  Dash <-->|"WebSocket (discordID + token)"| WS

  API --> Maria
  API --> Mongo
  API --> Minio
  API --> SteamAPI
  API -->|"enqueue BullMQ job"| Redis

  WS --> Redis
  WS -->|"enqueue push job"| Redis

  Redis -->|"BullMQ queues"| DISCORD
  DISCORD --> Maria
  DISCORD --> Minio
  DISCORD -->|"reply key bullmq:reply:*"| Redis
  DISCORD <--> DiscordAPI
```

## 2. End-to-end request flow

Source: [`request-flow.mmd`](./request-flow.mmd)

A single in-game event and a single dashboard action, from client to Discord and back.

```mermaid
sequenceDiagram
    participant Lua as GMod addon (submodule)
    participant API as apps/api
    participant WS as apps/websocket
    participant DB as MariaDB / Mongo (infra-prisma / infra-mongo)
    participant BullMQ as packages/infra-bullmq (Redis)
    participant Discord as apps/discord
    participant Web as apps/website (dashboard)

    Lua->>API: HTTP request (server token/ID auth)
    Lua->>WS: persistent WebSocket (server id/token)
    API->>DB: read/write via domain-* classes
    API->>BullMQ: enqueue job (e.g. sync role, post log)
    BullMQ->>Discord: worker consumes job
    Discord-->>BullMQ: reply written to Redis key (if a result is needed)
    BullMQ-->>API: reply polled back (or timeout)
    Web->>API: HTTP (dashboard CRUD)
    Web->>WS: WebSocket (discordID + token auth)
    WS-->>Web: live push (server status, ack)
    WS->>BullMQ: wsSendToServerQueue / wsSendToAllClientsOfServerQueue
```

## 3. Discord/BullMQ request-reply bridge

Source: [`discord-bullmq-bridge.mmd`](./discord-bullmq-bridge.mmd)

The mechanism behind every `enqueueDiscordX(...)` call in
[`@gmod/infra-bullmq`](../packages/infra-bullmq.md) — how a caller that isn't `apps/discord` gets a typed
result back from an action that only the live Discord client can perform.

```mermaid
sequenceDiagram
    participant Caller as apps/api or packages/domain-*
    participant Adapter as infra-bullmq discordQueueAdapters
    participant Queue as BullMQ queue (Redis)
    participant Worker as apps/discord worker
    participant ReplyKey as Redis reply key

    Caller->>Adapter: enqueueDiscordGuildX(data)
    Adapter->>Adapter: validate payload (Zod JobSchema) + generate correlationId
    Adapter->>Queue: queue.add(jobName, payload)
    Queue->>Worker: job delivered
    Worker->>Worker: execute Discord action (live discord.js client)
    Worker->>ReplyKey: SET bullmq:reply:correlationId (Zod ReplySchema, short TTL)

    loop poll every 100ms until timeoutMs
        Adapter->>ReplyKey: GET bullmq:reply:correlationId
    end

    ReplyKey-->>Adapter: reply JSON found
    Adapter->>Adapter: parse against ReplySchema, DEL key
    Adapter-->>Caller: typed result

    Note over Adapter,ReplyKey: if no reply before timeoutMs,<br/>throws BullMQReplyTimeoutError instead
```

## 4. WebSocket cross-replica delivery

Source: [`websocket-delivery.mmd`](./websocket-delivery.mmd)

Why a message addressed to a GMod server doesn't get lost when `apps/websocket` runs multiple replicas and
that server's socket lives on a different replica than the one that received the job.

```mermaid
sequenceDiagram
    participant Producer as any app/package (e.g. domain-guild)
    participant Q as wsSendToServerQueue (BullMQ)
    participant W1 as apps/websocket replica A
    participant W2 as apps/websocket replica B
    participant PubSub as Redis pub/sub broadcast channel
    participant Server as GMod server socket

    Producer->>Q: enqueue id and data
    Q->>W1: job delivered to replica A
    W1->>W1: wsSendToServer(id, data)<br/>check local clients.server

    alt server connected to replica A (local hit)
        W1->>Server: ws.send(data)
        W1-->>Q: job resolves true
    else server connected to a different replica
        W1->>PubSub: publish id, data, requestId<br/>SET ack key (TTL 5s)
        PubSub->>W2: message received
        W2->>W2: check local clients.server
        W2->>Server: ws.send(data)
        W2->>PubSub: INCR ack key for requestId
        W1->>W1: poll ack key every 60ms, up to 600ms
        W1-->>Q: job resolves true/false based on ack
    end
```

## 5. Package dependency layers

Source: [`package-dependency-layers.mmd`](./package-dependency-layers.mmd)

The allowed-dependency rule from
[architecture.md — Allowed dependencies](../architecture.md#allowed-dependencies), drawn as edges — every
arrow points "downward". An edge going the other way (e.g. an `infra-*` package importing `domain-*`, or
`packages/*` importing `apps/*`) is the anti-pattern to catch in review.

```mermaid
graph TD
  subgraph Apps["apps/*"]
    API[api]
    DISCORD[discord]
    WS[websocket]
    WEBSITE[website]
  end

  subgraph CoreLayer["packages/core"]
    CORE[core]
  end

  subgraph DomainLayer["packages/domain-*"]
    DS[domain-server]
    DG[domain-guild]
    DU[domain-user]
    DM[domain-moderation]
    DC[domain-compliance]
    DGM[domain-gmod]
  end

  subgraph InfraLayer["packages/infra-*"]
    IP[infra-prisma]
    IM[infra-mongo]
    IR[infra-redis]
    IB[infra-bullmq]
    IW[infra-websocket]
    IMN[infra-minio]
    IS[infra-steam]
  end

  subgraph BaseLayer["packages/schema + config"]
    SCHEMA[schema]
    CONFIG[config]
  end

  API --> CORE
  API --> DS
  API --> DG
  DISCORD --> CORE
  DISCORD --> DG
  WS --> DS
  WS --> DU

  CORE --> DS
  CORE --> DG
  CORE --> DU
  CORE --> IB
  CORE --> IP

  DS --> IP
  DS --> IR
  DS --> IW
  DS --> SCHEMA
  DS --> CONFIG

  DG --> DS
  DG --> DU
  DG --> IB
  DG --> CONFIG

  DM --> DS
  DC --> DGM
  DC --> DU
  DGM --> IM
  DGM --> SCHEMA

  IB --> SCHEMA
  IW --> IB
  IS --> IMN
```

This is a representative subset (the busiest packages), not exhaustive — see each package's own doc under
[docs/packages/](../packages) for its full dependency list.

## 6. Production deployment topology

Source: [`deployment-topology.mmd`](./deployment-topology.mmd)

Matches `docker-stack.swarm.yml` and [docs/deployment/swarm.md](../deployment/swarm.md): replica counts,
Traefik routing, and which services touch which datastore.

```mermaid
graph TD
  CF["Cloudflare Tunnel"]

  subgraph Swarm["Docker Swarm stack: gmod"]
    TRAEFIK["Traefik (1 replica)<br/>ports 80 / 443 / 8080"]

    subgraph AppsReplicated["apps, 2 replicas each"]
      API["gmod_api x2"]
      WSVC["gmod_websocket x2"]
      DISCORDSVC["gmod_discord x2"]
    end

    subgraph Stateful["stateful services, 1 replica each"]
      MARIADB[("gmod_mariadb")]
      REDIS[("gmod_redis")]
      MONGO[("gmod_mongo")]
      MINIO[("gmod_minio")]
    end

    MIGRATE["gmod_prisma-migrate<br/>runs db push, then exits"]
  end

  CF -->|api.your-domain.com| TRAEFIK
  CF -->|ws.your-domain.com| TRAEFIK
  CF -->|traefik.your-domain.com| TRAEFIK

  TRAEFIK --> API
  TRAEFIK --> WSVC

  API --> MARIADB
  API --> REDIS
  API --> MONGO
  API --> MINIO

  WSVC --> REDIS
  WSVC --> MARIADB

  DISCORDSVC --> MARIADB
  DISCORDSVC --> REDIS
  DISCORDSVC --> MONGO

  MIGRATE --> MARIADB

  API -.BullMQ jobs via REDIS.-> DISCORDSVC
```
