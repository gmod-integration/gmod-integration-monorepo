locals {
  template_file_id = coalesce(var.template_file_id, try(proxmox_download_file.template[0].id, null))
  gateway          = split("/", var.bridge_address)[0]
  container_ip     = split("/", var.ipv4_address)[0]
}

# Unprivileged LXC running Docker (nesting + keyctl), same recipe as the earlier nginx test.
# All state lives under /var/lib/docker, on its own volume (mount_point below).
resource "proxmox_virtual_environment_container" "gmod" {
  node_name   = var.node_name
  vm_id       = var.vm_id
  pool_id     = local.pool_id
  description = "gmod-integration stack (Docker Compose). Managed by Terraform: infra/proxmox in the monorepo. Ops: `pct exec ${var.vm_id} -- gmodctl status`."
  tags        = ["gmod-integration", "terraform"]

  unprivileged  = true
  started       = true
  start_on_boot = true
  protection    = var.protection

  operating_system {
    template_file_id = local.template_file_id
    type             = "ubuntu"
  }

  cpu {
    cores = var.cores
  }

  memory {
    dedicated = var.memory_mb
    swap      = var.swap_mb
  }

  disk {
    datastore_id = local.datastore_id
    size         = var.rootfs_size_gb
  }

  mount_point {
    volume = local.datastore_id
    size   = "${var.docker_disk_size_gb}G"
    path   = "/var/lib/docker"
    backup = true
  }

  network_interface {
    name   = "eth0"
    bridge = local.bridge
  }

  initialization {
    hostname = var.hostname

    ip_config {
      ipv4 {
        address = var.ipv4_address
        gateway = local.gateway
      }
    }

    dynamic "dns" {
      for_each = length(var.dns_servers) > 0 ? [1] : []
      content {
        servers = var.dns_servers
      }
    }

    dynamic "user_account" {
      for_each = length(var.ssh_public_keys) > 0 ? [1] : []
      content {
        keys = var.ssh_public_keys
      }
    }
  }

  features {
    nesting = true
    keyctl  = true
  }

  lifecycle {
    precondition {
      condition     = cidrhost("${local.container_ip}/${split("/", var.bridge_address)[1]}", 0) == cidrhost(var.bridge_address, 0)
      error_message = "ipv4_address (${var.ipv4_address}) is not in the bridge subnet (${var.bridge_address})."
    }
  }
}

resource "proxmox_backup_job" "gmod" {
  count         = var.backup_storage == null ? 0 : 1
  id            = "gmod-integration"
  comment       = "gmod-integration CT (Terraform: infra/proxmox)"
  node          = var.node_name
  vmid          = [tostring(proxmox_virtual_environment_container.gmod.vm_id)]
  storage       = var.backup_storage
  schedule      = var.backup_schedule
  mode          = "snapshot"
  compress      = "zstd"
  prune_backups = var.backup_retention
}
