terraform {
  # 1.7+: mock_provider in tests/. Import blocks (imports.tf.example) need 1.5+.
  required_version = ">= 1.7"

  required_providers {
    proxmox = {
      source  = "bpg/proxmox"
      version = "~> 0.120"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

provider "proxmox" {
  endpoint  = var.proxmox_endpoint
  api_token = "${var.proxmox_api_token_id}=${var.proxmox_api_token}"
  insecure  = var.proxmox_insecure

  ssh {
    agent    = true
    username = "root"
    # Setting `keyctl` on a container is a root@pam-only operation that an API token cannot do,
    # even root@pam's own token: the provider mints a root ticket over SSH for those calls.
    root_ticket = true

    node {
      name    = var.node_name
      address = var.ssh_host
      port    = var.ssh_port
    }
  }
}
