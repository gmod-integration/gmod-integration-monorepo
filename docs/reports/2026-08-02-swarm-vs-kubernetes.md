# Docker Swarm vs. Kubernetes for this project

- **Date:** 2026-08-02
- **Requested by / context:** user question — "swarm est en mort cérébrale" (is Swarm brain-dead?) — should
  the production stack move from Docker Swarm to Kubernetes.
- **Status:** Open (recommendation only, nothing implemented)

## Context

The `gmod` stack currently deploys to production with Docker Swarm (`docker-stack.swarm.yml`,
[docs/deployment/swarm.md](../deployment/swarm.md)): 8 services — `traefik`, `api`, `websocket`, `discord`,
`mariadb`, `redis`, `mongo`, `minio` — with rolling updates, automatic rollback on failed health, and Traefik
as ingress/reverse proxy. Every stateful service (`mariadb`, `redis`, `mongo`, `minio`, `traefik`) is pinned to
`node.role == manager`, and only `api`/`websocket`/`discord` run at `replicas: 2`. That placement pattern is
typical of a **single-manager, small-node-count cluster** — not a multi-node HA setup.

The question was whether "Swarm is dead" is true, and whether that alone is a reason to migrate to Kubernetes.

## Findings

**1. Swarm is not dead, but it is not evolving either.**
Docker Swarm mode (the `docker stack deploy` / SwarmKit-based mode this project uses) still ships with every
Docker Engine install, is still maintained for security and compatibility fixes, and still works exactly as
documented. What's true is:
- No meaningful new features have landed in Swarm mode in years — it's in de facto maintenance mode.
- Docker Inc./Mirantis's public messaging and investment has clearly shifted to Compose + Kubernetes
  compatibility rather than Swarm-native features.
- The ecosystem around it (managed hosting, third-party tooling, operators, StackOverflow/GitHub activity) has
  shrunk to a trickle compared to Kubernetes, which is now the de facto industry standard.

So "mort cérébrale" is a fair characterization of Swarm's *trajectory* (no innovation, shrinking mindshare),
but not of its *present-day reliability* — nothing in this stack would stop working, and there's no announced
deprecation/removal date for Swarm mode in Docker Engine.

**2. What Kubernetes would actually add here, given this stack's shape:**
- Multi-node bin-packing, autoscaling (HPA/VPA/cluster autoscaler) — not applicable today: the stack pins
  every stateful service to the manager node and runs at fixed `replicas: 2`. There's no autoscaling signal
  being used in Swarm either, so nothing would change on day one.
- A much larger ecosystem: Helm charts for `mariadb`/`redis`/`mongo`/`minio` (vs. hand-rolled healthcheck/wait
  scripts currently baked into `command:` blocks in the stack file), operators, service mesh, richer
  observability integrations.
- Standard skill: more engineers know k8s than Swarm, easier to hire/onboard against it long-term.
- Ingress: would replace Traefik-as-Swarm-provider with an Ingress controller (Traefik itself has a
  first-class Kubernetes Ingress/Gateway API mode, so that specific piece ports over cleanly).

**3. What Kubernetes would cost here:**
- A real control plane to run and secure (`kubeadm`/`k3s` self-managed, or a managed offering — EKS/GKE/DOKS
  — which adds hosting cost and vendor lock-in considerations). Swarm's control plane is "part of Docker
  Engine, free, already running."
- Every `deploy:` block in `docker-stack.swarm.yml` (restart/update/rollback policies, placement constraints,
  resource limits) has a Kubernetes equivalent, but expressed differently (Deployment/StatefulSet, PDB,
  RollingUpdate strategy, nodeSelector/affinity) — this is a full rewrite of the stack file, not a
  translation script.
- Stateful services (`mariadb`, `mongo`, `redis`, `minio`) currently use simple named Docker volumes. On k8s
  they'd need PersistentVolumeClaims and a StorageClass backed by real block/network storage — more moving
  parts for the same single-node reality this stack has today.
- New operational surface: RBAC, CNI, DNS (CoreDNS), etcd health, YAML sprawl — meaningful ongoing ops burden
  for what is currently an 8-service, largely single-node stack.
- The `.env`-driven, script-based deploy flow (`scripts/swarm-deploy.sh`, `scripts/swarm-backup.sh`) would
  need to be rebuilt (kubectl/Helm-based), including the custom MariaDB-schema-readiness wait logic currently
  embedded in each service's `command:`.

**4. Scale reality check.** Nothing in the repo (deploy scripts, stack file, README) indicates more than a
small number of nodes today, and every stateful service is manager-pinned — i.e., this isn't yet a workload
that's hitting Swarm's actual limitations (weak multi-node stateful orchestration, no native autoscaling, thin
ecosystem). Those limitations matter once you have multiple worker nodes, need to bin-pack many services
efficiently, or need autoscaling — none of which this stack does yet.

## Recommendation

**Stay on Docker Swarm for now.** "Swarm has no future feature roadmap" is true but not itself a production
risk for a stack this size — it does what this project needs (rolling updates, rollback, basic placement,
health-gated startup) with an operational footprint of essentially zero extra infrastructure.

Migrate to Kubernetes when at least one of these becomes true, not before:
- You need real multi-node scheduling/autoscaling (more than 1-2 worker nodes, variable load).
- You need HA for the stateful services (`mariadb`/`mongo`/`redis`/`minio`) across nodes — Swarm can do this
  but it's clunky (volume replication is DIY); k8s + StatefulSets + a StorageClass is the standard answer.
- Hiring/team-knowledge reasons make "everyone already knows k8s" outweigh the migration cost.
- You want to adopt the broader CNCF ecosystem (service mesh, GitOps via ArgoCD/Flux, Helm charts for the
  managed DBs instead of hand-rolled wait scripts).

If/when that trigger arrives, the lowest-friction path for a stack this size is **k3s** (single binary,
much closer to Swarm's "just works" operational profile than full kubeadm/managed k8s) rather than jumping
straight to EKS/GKE-scale complexity.

## Outcome

Not yet acted on.
