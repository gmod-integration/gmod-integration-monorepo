# terraform test — plan-only, Proxmox API mocked: no call reaches a real node, nothing is provisioned.

mock_provider "proxmox" {}

override_resource {
  target          = random_password.maria
  override_during = plan
  values          = { result = "generated_maria_password_0000000" }
}

override_resource {
  target          = random_password.maria_root
  override_during = plan
  values          = { result = "generated_root_password_00000000" }
}

override_resource {
  target          = random_password.minio_access_key
  override_during = plan
  values          = { result = "generatedaccesskey00" }
}

override_resource {
  target          = random_password.minio_secret_key
  override_during = plan
  values          = { result = "generated_minio_secret_key_0000000000000" }
}

variables {
  proxmox_endpoint  = "https://pve.invalid:8006/"
  proxmox_api_token = "00000000-0000-0000-0000-000000000000"
  node_name         = "pve-test"
  ssh_host          = "127.0.0.1"
  api_host          = "api.example.com"
  ws_host           = "ws.example.com"
  template_file_id  = "dir-gmi:vztmpl/ubuntu-24.04-standard_24.04-2_amd64.tar.zst"
  # Every input the assertions depend on is pinned here: terraform test also loads a local terraform.tfvars
  # and TF_VAR_* from the shell (e.g. TF_VAR_cloudflare_tunnel_token), which must not leak into the tests.
  cloudflare_tunnel_token = null
  env_file                = null
  delegated_user_id       = null
  manage_host_resources   = true
  bridge_address          = "10.10.10.1/24"
  ipv4_address            = "10.10.10.20/24"
  image_tag               = "latest"
  replicas                = {}

  app_env = {
    WEBSITE_URL                             = "https://example.com"
    DISCORD_GUILD_ID                        = "1"
    SCREENSHOTS_CHANNEL_ID                  = "2"
    DISCORD_CLIENT_ID                       = "3"
    DISCORD_CLIENT_SECRET                   = "4"
    OAUTH_PANEL_URL                         = "https://example.com/oauth"
    OAUTH_REDIRECT_URL                      = "https://example.com/oauth/cb"
    DISCORD_BOT_TOKEN                       = "token"
    DISCORD_BOT_INVITE_URL                  = "https://discord.com/invite"
    DISCORD_GUILD_PREMIUM_ROLE_ID           = "5"
    DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID = "6"
    DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID   = "7"
    DISCORD_SUBSCRIPTION_SKU_ID             = "8"
    SIGNING_SECRET_WEBHOOK                  = "9"
    GMODSTORE_API_KEY                       = "10"
    GMODSTORE_SECRET_WEBHOOK                = "11"
    BARER_DISCORD_RELAY                     = "12"
    STEAM_API_KEY                           = "13"
  }
}

run "complete_env_renders" {
  command = plan

  assert {
    condition     = strcontains(local.env_content, "API_HOST=api.example.com\n")
    error_message = "API_HOST missing from .env"
  }
  assert {
    condition     = strcontains(local.env_content, "DOMAIN_URL=https://api.example.com\n")
    error_message = "DOMAIN_URL should default to https://<api_host>"
  }
  assert {
    condition     = strcontains(local.env_content, "MARIA_PASSWORD=generated_maria_password_0000000\n")
    error_message = "generated MariaDB password not used"
  }
  assert {
    condition     = strcontains(local.env_content, "DISCORD_REPLICAS=1\n") && strcontains(local.env_content, "API_REPLICAS=2\n")
    error_message = "replica defaults not rendered"
  }
  assert {
    condition     = strcontains(local.env_content, "API_IMAGE=ghcr.io/gmod-integration/gmod-integration-api:latest\n")
    error_message = "image tag not rendered"
  }
  assert {
    condition     = strcontains(local.env_content, "COMPOSE_PROFILES=\n")
    error_message = "tunnel profile must be off without a token"
  }
  assert {
    condition     = local.gateway == "10.10.10.1"
    error_message = "gateway should come from bridge_address"
  }
  assert {
    condition     = length(proxmox_acl.delegated) == 0
    error_message = "no ACL without delegated_user_id"
  }
  assert {
    condition     = length(proxmox_download_file.template) == 0
    error_message = "template must not be downloaded when template_file_id is set"
  }
}

run "tunnel_and_overrides" {
  command = plan

  variables {
    cloudflare_tunnel_token = "tunnel-token"
    image_tag               = "sha-abc"
    replicas                = { discord = 2 }
    delegated_user_id       = "gmod-integration@pam"
  }

  assert {
    condition     = strcontains(local.env_content, "COMPOSE_PROFILES=tunnel\n")
    error_message = "tunnel profile not enabled"
  }
  assert {
    condition     = local.cloudflared_env == "TUNNEL_TOKEN=tunnel-token\n"
    error_message = "cloudflared.env not rendered"
  }
  assert {
    condition     = !strcontains(local.env_content, "tunnel-token")
    error_message = "the tunnel token must not reach the app containers' .env"
  }
  assert {
    condition     = strcontains(local.env_content, "DISCORD_IMAGE=ghcr.io/gmod-integration/gmod-integration-discord:sha-abc\n")
    error_message = "image_tag not applied"
  }
  assert {
    condition     = strcontains(local.env_content, "DISCORD_REPLICAS=2\n") && strcontains(local.env_content, "WEBSOCKET_REPLICAS=2\n")
    error_message = "partial replicas override broke the other defaults"
  }
  assert {
    condition     = length(proxmox_acl.delegated) == 3
    error_message = "expected pool, storage and bridge ACLs"
  }
}

run "env_file_parsing_and_precedence" {
  command = plan

  variables {
    env_file = "tests/fixtures/prod.env"
    app_env = {
      DISCORD_GUILD_ID                        = "1"
      SCREENSHOTS_CHANNEL_ID                  = "2"
      DISCORD_CLIENT_ID                       = "3"
      DISCORD_CLIENT_SECRET                   = "4"
      OAUTH_PANEL_URL                         = "https://example.com/oauth"
      OAUTH_REDIRECT_URL                      = "https://example.com/oauth/cb"
      DISCORD_BOT_INVITE_URL                  = "https://discord.com/invite"
      DISCORD_GUILD_PREMIUM_ROLE_ID           = "5"
      DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID = "6"
      DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID   = "7"
      DISCORD_SUBSCRIPTION_SKU_ID             = "8"
      SIGNING_SECRET_WEBHOOK                  = "9"
      GMODSTORE_API_KEY                       = "10"
      GMODSTORE_SECRET_WEBHOOK                = "11"
      BARER_DISCORD_RELAY                     = "12"
      STEAM_API_KEY                           = "13"
    }
  }

  assert {
    condition     = strcontains(local.env_content, "WEBSITE_URL=https://example.com\n")
    error_message = "`export KEY=` lines must be parsed"
  }
  assert {
    condition     = strcontains(local.env_content, "DOMAIN_URL=\"https://api.example.com\"\n")
    error_message = "quoted values must be kept raw, and env_file must win over the generated default"
  }
  assert {
    condition     = strcontains(local.env_content, "MARIA_PASSWORD=from_env_file_long_enough_123\n")
    error_message = "env_file must win over generated credentials"
  }
  assert {
    condition     = strcontains(local.env_content, "DISCORD_BOT_TOKEN=second # inline comment\n")
    error_message = "last duplicate must win, raw"
  }
  assert {
    condition     = strcontains(local.env_content, "WEIRD='a=b=c'\n")
    error_message = "values containing '=' must survive"
  }
  assert {
    condition     = strcontains(local.env_content, "MARIA_ROOT_PASSWORD=generated_root_password_00000000\n")
    error_message = "keys absent from env_file keep their generated value"
  }
}

run "missing_keys_fail_at_plan" {
  command = plan

  variables {
    app_env = { WEBSITE_URL = "https://example.com", STEAM_API_KEY = "" }
  }

  expect_failures = [terraform_data.deploy]
}

run "placeholder_values_fail" {
  command = plan

  variables {
    env_file = "../../.env.example"
  }

  expect_failures = [terraform_data.deploy]
}

run "weak_secret_fails" {
  command = plan

  variables {
    app_env = {
      MARIA_PASSWORD                          = "short"
      WEBSITE_URL                             = "https://example.com"
      DISCORD_GUILD_ID                        = "1"
      SCREENSHOTS_CHANNEL_ID                  = "2"
      DISCORD_CLIENT_ID                       = "3"
      DISCORD_CLIENT_SECRET                   = "4"
      OAUTH_PANEL_URL                         = "https://example.com/oauth"
      OAUTH_REDIRECT_URL                      = "https://example.com/oauth/cb"
      DISCORD_BOT_TOKEN                       = "token"
      DISCORD_BOT_INVITE_URL                  = "https://discord.com/invite"
      DISCORD_GUILD_PREMIUM_ROLE_ID           = "5"
      DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID = "6"
      DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID   = "7"
      DISCORD_SUBSCRIPTION_SKU_ID             = "8"
      SIGNING_SECRET_WEBHOOK                  = "9"
      GMODSTORE_API_KEY                       = "10"
      GMODSTORE_SECRET_WEBHOOK                = "11"
      BARER_DISCORD_RELAY                     = "12"
      STEAM_API_KEY                           = "13"
    }
  }

  expect_failures = [terraform_data.deploy]
}

run "root_maria_user_fails" {
  command = plan

  variables {
    app_env = {
      MARIA_USER                              = "root"
      WEBSITE_URL                             = "https://example.com"
      DISCORD_GUILD_ID                        = "1"
      SCREENSHOTS_CHANNEL_ID                  = "2"
      DISCORD_CLIENT_ID                       = "3"
      DISCORD_CLIENT_SECRET                   = "4"
      OAUTH_PANEL_URL                         = "https://example.com/oauth"
      OAUTH_REDIRECT_URL                      = "https://example.com/oauth/cb"
      DISCORD_BOT_TOKEN                       = "token"
      DISCORD_BOT_INVITE_URL                  = "https://discord.com/invite"
      DISCORD_GUILD_PREMIUM_ROLE_ID           = "5"
      DISCORD_GUILD_GMODSTORE_PREMIUM_ROLE_ID = "6"
      DISCORD_GUILD_DISCORD_PREMIUM_ROLE_ID   = "7"
      DISCORD_SUBSCRIPTION_SKU_ID             = "8"
      SIGNING_SECRET_WEBHOOK                  = "9"
      GMODSTORE_API_KEY                       = "10"
      GMODSTORE_SECRET_WEBHOOK                = "11"
      BARER_DISCORD_RELAY                     = "12"
      STEAM_API_KEY                           = "13"
    }
  }

  expect_failures = [terraform_data.deploy]
}

run "ip_outside_bridge_subnet_fails" {
  command = plan

  variables {
    ipv4_address = "192.168.1.20/24"
  }

  expect_failures = [proxmox_virtual_environment_container.gmod]
}
