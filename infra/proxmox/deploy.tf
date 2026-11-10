# Pushes the stack into the container and runs `gmodctl deploy`, over SSH to the Proxmox host
# (pct push / pct exec: the container itself needs no SSH server nor inbound access).
#
# Re-runs whenever the container is replaced or anything it ships changes: the stack file, the Compose
# override, gmodctl, the rendered .env or the tunnel token. `docker compose up -d` then only recreates the
# services whose configuration changed. Force a redeploy with:
#   terraform apply -replace=terraform_data.deploy

locals {
  staging_dir = "/root/gmod-integration-deploy-${var.vm_id}"

  bundle = {
    "gmodctl.sh"             = file("${path.module}/files/gmodctl.sh")
    "push.sh"                = file("${path.module}/files/push.sh")
    "compose.proxmox.yml"    = file("${path.module}/files/compose.proxmox.yml")
    "docker-stack.swarm.yml" = file("${path.module}/../../docker-stack.swarm.yml")
  }
}

resource "terraform_data" "deploy" {
  triggers_replace = {
    container = proxmox_virtual_environment_container.gmod.id
    bundle    = sha256(jsonencode(local.bundle))
    # Hashes of high-entropy secrets: safe to show, and the plan says which part changed.
    env     = nonsensitive(sha256(local.env_content))
    tunnel  = nonsensitive(sha256(local.cloudflared_env))
    options = "auto_update=${var.auto_update} interval=${var.auto_update_interval}"
  }

  lifecycle {
    precondition {
      condition     = length(local.env_missing_keys) == 0
      error_message = "Missing or empty application variables (set them in app_env or env_file, see .env.example): ${join(", ", local.env_missing_keys)}"
    }
    precondition {
      condition     = length(local.env_placeholder_keys) == 0
      error_message = "Still set to the .env.example placeholder \"SECRET\": ${join(", ", local.env_placeholder_keys)}"
    }
    precondition {
      condition     = length(local.env_weak_keys) == 0
      error_message = "@gmod/config requires more than 16 characters for: ${join(", ", local.env_weak_keys)}"
    }
    precondition {
      condition     = !local.env_maria_user_is_root
      error_message = "MARIA_USER must not be \"root\": the MariaDB image refuses MARIADB_USER=root (root is MARIA_ROOT_PASSWORD). Set MARIA_USER = \"gmod\" in app_env."
    }
  }

  connection {
    type  = "ssh"
    host  = var.ssh_host
    port  = var.ssh_port
    user  = "root"
    agent = true
  }

  provisioner "remote-exec" {
    inline = ["rm -rf ${local.staging_dir} && install -d -m 0700 ${local.staging_dir}"]
  }

  provisioner "file" {
    content     = local.bundle["gmodctl.sh"]
    destination = "${local.staging_dir}/gmodctl.sh"
  }

  provisioner "file" {
    content     = local.bundle["push.sh"]
    destination = "${local.staging_dir}/push.sh"
  }

  provisioner "file" {
    content     = local.bundle["compose.proxmox.yml"]
    destination = "${local.staging_dir}/compose.proxmox.yml"
  }

  provisioner "file" {
    content     = local.bundle["docker-stack.swarm.yml"]
    destination = "${local.staging_dir}/docker-stack.swarm.yml"
  }

  provisioner "file" {
    content     = local.env_content
    destination = "${local.staging_dir}/.env"
  }

  provisioner "file" {
    content     = local.cloudflared_env
    destination = "${local.staging_dir}/cloudflared.env"
  }

  # push.sh deletes the staging dir (it holds the .env) on exit, success or not.
  provisioner "remote-exec" {
    inline = [
      "bash ${local.staging_dir}/push.sh ${var.vm_id} ${local.staging_dir} --auto-update ${var.auto_update} --interval ${var.auto_update_interval}",
    ]
  }
}
