# Host-level resources the container depends on. Gated by var.manage_host_resources so the module also
# works against a Proxmox where they already exist (and are managed elsewhere).
#
# Adopting the ones created by an earlier Terraform config: see imports.tf.example.

resource "proxmox_virtual_environment_pool" "gmod" {
  count   = var.manage_host_resources ? 1 : 0
  pool_id = var.pool_id
}

resource "proxmox_storage_directory" "gmod" {
  count   = var.manage_host_resources ? 1 : 0
  id      = var.datastore_id
  path    = var.datastore_path
  content = var.backup_storage == var.datastore_id ? ["rootdir", "snippets", "vztmpl", "backup"] : ["rootdir", "snippets", "vztmpl"]
  shared  = false

  backups {
    keep_all = true
  }
}

# The bridge has no physical port: the host routes and masquerades 10.10.10.0/24 itself. That NAT rule
# is not something the Proxmox API can express, see docs/deployment/proxmox.md.
resource "proxmox_network_linux_bridge" "gmod" {
  count     = var.manage_host_resources ? 1 : 0
  node_name = var.node_name
  name      = var.bridge
  address   = var.bridge_address
  autostart = true
  comment   = "Isolated NAT network for gmod-integration CTs (infra/proxmox)"

  lifecycle {
    # Do not rewrite an adopted bridge (and reload the host network) just for its comment.
    ignore_changes = [comment]
  }
}

locals {
  delegated_acls = var.manage_host_resources && var.delegated_user_id != null ? {
    pool    = { path = "/pool/${var.pool_id}", role = "PVEAdmin" }
    storage = { path = "/storage/${var.datastore_id}", role = "PVEAdmin" }
    bridges = { path = "/sdn/zones/localnetwork", role = "PVESDNUser" }
  } : {}
}

resource "proxmox_acl" "delegated" {
  for_each  = local.delegated_acls
  path      = each.value.path
  user_id   = var.delegated_user_id
  role_id   = each.value.role
  propagate = true

  depends_on = [proxmox_virtual_environment_pool.gmod, proxmox_storage_directory.gmod]
}

# Name references that also carry the dependency on the resources above when they are managed here.
locals {
  pool_id      = var.manage_host_resources ? proxmox_virtual_environment_pool.gmod[0].pool_id : var.pool_id
  datastore_id = var.manage_host_resources ? proxmox_storage_directory.gmod[0].id : var.datastore_id
  bridge       = var.manage_host_resources ? proxmox_network_linux_bridge.gmod[0].name : var.bridge
}

resource "proxmox_download_file" "template" {
  count        = var.template_file_id == null ? 1 : 0
  node_name    = var.node_name
  datastore_id = local.datastore_id
  content_type = "vztmpl"
  url          = var.template_url
  # Never delete a template file this config did not download: set var.template_file_id to use it instead.
  overwrite_unmanaged = false
}
