###############################################################################
# Proxmox connection
###############################################################################

variable "proxmox_endpoint" {
  description = "Proxmox API URL, e.g. https://pve.example.com:8006/"
  type        = string
}

variable "proxmox_api_token_id" {
  description = "API token id (user@realm!tokenid). Not secret."
  type        = string
  default     = "root@pam!terraform"
}

variable "proxmox_api_token" {
  description = "API token secret (the UUID part only)."
  type        = string
  sensitive   = true
}

variable "proxmox_insecure" {
  description = "Skip TLS verification of the Proxmox API (self-signed certificate)."
  type        = bool
  default     = false
}

variable "node_name" {
  description = "Proxmox node that hosts the container."
  type        = string
}

variable "ssh_host" {
  description = "Address Terraform uses to SSH into the node as root (provider file uploads + deployment)."
  type        = string
}

variable "ssh_port" {
  description = "SSH port of the node."
  type        = number
  default     = 22
}

###############################################################################
# Host resources (pool, storage, bridge, ACLs)
###############################################################################

variable "manage_host_resources" {
  description = <<-EOT
    Create the pool, directory storage, bridge and ACLs below. Set to false when they already exist and
    are managed elsewhere: the container then only references them by name.
  EOT
  type        = bool
  default     = false
}

variable "pool_id" {
  description = "Resource pool the container is placed in."
  type        = string
  default     = "gmod-integration"
}

variable "datastore_id" {
  description = "Storage for the container disks and the CT template (needs content types rootdir + vztmpl)."
  type        = string
  default     = "dir-gmi"
}

variable "datastore_path" {
  description = "Directory backing var.datastore_id when manage_host_resources = true."
  type        = string
  default     = "/var/lib/vz"
}

variable "bridge" {
  description = "Bridge the container is attached to."
  type        = string
  default     = "vmbr1"
}

variable "bridge_address" {
  description = <<-EOT
    Host address + prefix of the bridge, also used as the container's gateway. The bridge has no uplink:
    outbound traffic needs a masquerade rule on the host (see docs/deployment/proxmox.md).
  EOT
  type        = string
  default     = "10.10.10.1/24"
}

variable "delegated_user_id" {
  description = "Optional Proxmox user given PVEAdmin on the pool and storage and PVESDNUser on local bridges (null = no ACL)."
  type        = string
  default     = null
}

###############################################################################
# Container
###############################################################################

variable "vm_id" {
  description = "CT id."
  type        = number
  default     = 110

  validation {
    condition     = var.vm_id >= 100 && var.vm_id <= 999999999 && floor(var.vm_id) == var.vm_id
    error_message = "vm_id must be a Proxmox container integer ID from 100 to 999999999."
  }
}

variable "hostname" {
  type    = string
  default = "gmod-integration"
}

variable "ipv4_address" {
  description = "Static address of the container, with prefix. Must be inside var.bridge_address's subnet."
  type        = string
  default     = "10.10.10.20/24"
}

variable "dns_servers" {
  description = "DNS servers for the container. Empty = inherit the host's resolv.conf."
  type        = list(string)
  default     = []
}

variable "cores" {
  type    = number
  default = 4
}

variable "memory_mb" {
  description = "RAM for MariaDB, Mongo, Redis and the application replicas. Verify actual headroom before the cutover."
  type        = number
  default     = 8192
}

variable "swap_mb" {
  type    = number
  default = 2048
}

variable "rootfs_size_gb" {
  description = "Root disk (OS + Docker binaries)."
  type        = number
  default     = 16
}

variable "docker_disk_size_gb" {
  description = "Separate volume mounted at /var/lib/docker: images and every named volume (MariaDB, Mongo, Redis, MinIO)."
  type        = number
  default     = 64
}

variable "ssh_public_keys" {
  description = "Optional keys for root inside the container. Not needed for operations: `pct enter <vmid>` from the host works."
  type        = list(string)
  default     = []
}

variable "protection" {
  description = "Proxmox protection flag: the container and its disks cannot be removed. Set to false before a destroy/replace."
  type        = bool
  default     = true
}

variable "template_file_id" {
  description = "Existing CT template (e.g. dir-gmi:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst). Null = download var.template_url."
  type        = string
  default     = null
}

variable "template_url" {
  description = "CT template downloaded into var.datastore_id when var.template_file_id is null. Debian/Ubuntu only (gmodctl uses apt)."
  type        = string
  default     = "http://download.proxmox.com/images/system/ubuntu-24.04-standard_24.04-2_amd64.tar.zst"
}

###############################################################################
# Backups (vzdump)
###############################################################################

variable "backup_storage" {
  description = "Storage (content type `backup`) for a nightly vzdump of the container. Null = no backup job."
  type        = string
  default     = null
}

variable "backup_schedule" {
  description = "systemd calendar event for the backup job."
  type        = string
  default     = "03:00"
}

variable "backup_retention" {
  description = "vzdump prune policy."
  type        = map(string)
  default = {
    keep-daily  = "7"
    keep-weekly = "4"
  }
}

###############################################################################
# Application
###############################################################################

variable "api_host" {
  description = "Public hostname of the API (Traefik host rule, and DOMAIN_URL unless overridden)."
  type        = string
}

variable "ws_host" {
  description = "Public hostname of the WebSocket gateway."
  type        = string
}

variable "env_file" {
  description = <<-EOT
    Optional path to an existing .env (e.g. a copy of production's). Its keys override the generated
    database/MinIO credentials; var.app_env overrides it. Host/port keys (MARIA_HOST, MINIO_ENDPOINT, …)
    are forced by docker-stack.swarm.yml anyway.
  EOT
  type        = string
  default     = null
}

variable "app_env" {
  description = "Application variables (Discord, GModStore, Steam, URLs…), see .env.example. Highest precedence."
  type        = map(string)
  default     = {}
  sensitive   = true

  validation {
    condition     = alltrue([for k, v in var.app_env : can(regex("^[A-Za-z_][A-Za-z0-9_]*$", k)) && !strcontains(v, "\n") && !strcontains(v, "\r")])
    error_message = "app_env requires valid environment variable names and single-line values."
  }
}

variable "cloudflare_tunnel_token" {
  description = "Token of a remotely-managed Cloudflare Tunnel run inside the container. Null = no tunnel."
  type        = string
  default     = null
  sensitive   = true

  validation {
    condition     = var.cloudflare_tunnel_token == null ? true : !strcontains(var.cloudflare_tunnel_token, "\n") && !strcontains(var.cloudflare_tunnel_token, "\r")
    error_message = "cloudflare_tunnel_token must be a single-line token."
  }
}

variable "app_images" {
  description = "Immutable release images. Preflight also checks all three org.opencontainers.image.revision labels match."
  type = object({
    api       = string
    websocket = string
    discord   = string
  })

  validation {
    condition     = alltrue([for image in values(var.app_images) : can(regex("^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[0-9a-f]{64}$", image))])
    error_message = "Every app image must be an immutable registry/repository@sha256:<64 lowercase hex characters> reference."
  }
}

variable "datastore_images" {
  description = "Immutable initial datastore versions. Changing these later requires a separate backed-up datastore upgrade."
  type = object({
    mariadb = string
    mongo   = string
    redis   = string
    minio   = string
  })

  validation {
    condition     = alltrue([for image in values(var.datastore_images) : can(regex("^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[0-9a-f]{64}$", image))])
    error_message = "Every datastore image must be an immutable registry/repository@sha256:<64 lowercase hex characters> reference."
  }
}

variable "ingress_images" {
  description = "Immutable Traefik and Cloudflare Tunnel images. cloudflared is started only when a token is supplied."
  type = object({
    traefik     = string
    cloudflared = string
  })

  validation {
    condition     = alltrue([for image in values(var.ingress_images) : can(regex("^[a-zA-Z0-9][a-zA-Z0-9._:/-]*@sha256:[0-9a-f]{64}$", image))])
    error_message = "Every ingress image must be an immutable registry/repository@sha256:<64 lowercase hex characters> reference."
  }
}

variable "deployment_mode" {
  description = "prepare installs and validates the bundle without starting containers. bootstrap explicitly starts a fresh installation and refuses existing data."
  type        = string
  default     = "prepare"

  validation {
    condition     = contains(["prepare", "bootstrap"], var.deployment_mode)
    error_message = "deployment_mode must be prepare or bootstrap; existing installations need a coordinated maintenance procedure."
  }
}

variable "replicas" {
  description = "Containers per app service. discord defaults to 1: the bot does not deduplicate gateway events across replicas."
  type = object({
    api       = optional(number, 2)
    websocket = optional(number, 2)
    discord   = optional(number, 1)
  })
  default = {}

  validation {
    condition     = alltrue([for count in [var.replicas.api, var.replicas.websocket] : count >= 1 && count <= 8 && floor(count) == count]) && var.replicas.discord == 1
    error_message = "API and WebSocket replicas must be integers from 1 to 8; Discord must have exactly one replica."
  }
}

variable "auto_update" {
  description = "Legacy timer setting. Automatic schema-changing releases are disabled; use a coordinated maintenance procedure."
  type        = bool
  default     = false

  validation {
    condition     = !var.auto_update
    error_message = "Automatic updates are disabled: migrations require a coordinated maintenance release. Set auto_update=false."
  }
}

variable "auto_update_interval" {
  description = "Legacy timer input retained for existing tfvars. No automatic timer is installed."
  type        = string
  default     = "15min"

  validation {
    condition     = can(regex("^[1-9][0-9]*(s|min|h|d)$", var.auto_update_interval))
    error_message = "auto_update_interval must be a simple positive systemd duration, e.g. 15min."
  }
}
