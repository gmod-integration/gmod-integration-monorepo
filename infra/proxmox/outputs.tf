output "container_vm_id" {
  value = proxmox_virtual_environment_container.gmod.vm_id
}

output "container_ip" {
  value = local.container_ip
}

output "tunnel_public_hostnames" {
  description = "Public hostnames to add to the Cloudflare Tunnel, all pointing at the same local service."
  value = {
    (var.api_host) = "http://localhost:80"
    (var.ws_host)  = "http://localhost:80"
  }
}

output "ops" {
  description = "Day-to-day commands, run from this machine."
  value = {
    status    = "ssh -p ${var.ssh_port} root@${var.ssh_host} pct exec ${var.vm_id} -- gmodctl status"
    logs      = "ssh -t -p ${var.ssh_port} root@${var.ssh_host} pct exec ${var.vm_id} -- gmodctl logs api"
    preflight = "ssh -p ${var.ssh_port} root@${var.ssh_host} pct exec ${var.vm_id} -- gmodctl preflight"
    bootstrap = "ssh -p ${var.ssh_port} root@${var.ssh_host} pct exec ${var.vm_id} -- gmodctl bootstrap --confirm-empty gmod"
    shell     = "ssh -t -p ${var.ssh_port} root@${var.ssh_host} pct enter ${var.vm_id}"
  }
}

output "generated_credentials" {
  description = "Credentials generated for MariaDB and MinIO (unless overridden). terraform output -json generated_credentials"
  sensitive   = true
  value = {
    MARIA_USER                = local.env["MARIA_USER"]
    MARIA_PASSWORD            = local.env["MARIA_PASSWORD"]
    MARIA_ROOT_PASSWORD       = local.env["MARIA_ROOT_PASSWORD"]
    MINIO_ACCESS_KEY          = local.env["MINIO_ACCESS_KEY"]
    MINIO_SECRET_KEY          = local.env["MINIO_SECRET_KEY"]
    AUTH_TOKEN_ENCRYPTION_KEY = local.env["AUTH_TOKEN_ENCRYPTION_KEY"]
    PRIVACY_HASH_SECRET       = local.env["PRIVACY_HASH_SECRET"]
  }
}
