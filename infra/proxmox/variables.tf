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
  default     = true
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
  description = "RAM. MariaDB + Mongo + Redis (capped at 5G, maxmemory 4gb) + 5 Bun processes at default replicas."
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
    condition     = alltrue([for v in values(var.app_env) : !strcontains(v, "\n")])
    error_message = "app_env values cannot contain newlines."
  }
}

variable "cloudflare_tunnel_token" {
  description = "Token of a remotely-managed Cloudflare Tunnel run inside the container. Null = no tunnel."
  type        = string
  default     = null
  sensitive   = true
}

variable "image_tag" {
  description = "Tag of the api/websocket/discord images on GHCR (`latest`, or `sha-<commit>` to pin)."
  type        = string
  default     = "latest"
}

variable "replicas" {
  description = "Containers per app service. discord defaults to 1: the bot does not deduplicate gateway events across replicas."
  type = object({
    api       = optional(number, 2)
    websocket = optional(number, 2)
    discord   = optional(number, 1)
  })
  default = {}
}

variable "auto_update" {
  description = "Systemd timer in the container that pulls new app images and redeploys when they changed."
  type        = bool
  default     = true
}

variable "auto_update_interval" {
  description = "systemd time span between image checks."
  type        = string
  default     = "15min"
}
