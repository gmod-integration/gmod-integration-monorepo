#!/usr/bin/env python3
"""Build a private, local test release for the v6 Proxmox deployment.

Only local Docker images/files are created. No server is contacted, no registry is
published to, and the original environment and Terraform files remain unchanged.
The receiver must resolve immutable registry digests before running the bootstrap.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import tarfile
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
ROLES = ("api", "websocket", "discord", "webhook-relay")


def website_origin(value):
    """Accept one HTTPS browser origin, without userinfo, path, query or fragment."""
    try:
        parsed = urlsplit(value)
        port = parsed.port
        hostname = parsed.hostname or ""
    except ValueError as error:
        raise argparse.ArgumentTypeError("--website-url requires a valid HTTPS origin.") from error
    if (parsed.scheme != "https" or parsed.username is not None or parsed.password is not None
            or parsed.path not in ("", "/") or parsed.query or parsed.fragment
            or not hostname or len(hostname) > 253 or (port is not None and not 1 <= port <= 65535)
            or any(not re.fullmatch(r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?", part)
                   for part in hostname.split("."))):
        raise argparse.ArgumentTypeError("--website-url requires an HTTPS origin without credentials, path or query.")
    return "https://" + hostname.lower() + (":" + str(port) if port not in (None, 443) else "")


def oauth_authorization_url(value, client_id, api_origin):
    """Keep configured authorization scopes while targeting the test app and API callback."""
    parsed = urlsplit(value)
    parameters = [(key, item) for key, item in parse_qsl(parsed.query, keep_blank_values=True)
                  if key not in {"client_id", "redirect_uri"}]
    parameters.extend((("client_id", client_id), ("redirect_uri", api_origin.rstrip("/") + "/v3/users/login")))
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(parameters), parsed.fragment))


def config_sha256(value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def portable_inspect_identity(inspected):
    """Identity fields unaffected by whether Docker's image Id names an index or config."""
    return {
        "os": inspected["Os"], "architecture": inspected["Architecture"], "variant": inspected.get("Variant", ""),
        "rootfs_diff_ids": list(inspected["RootFS"]["Layers"]),
        "runtime_config_sha256": config_sha256(inspected["Config"]),
    }


def archive_image_identities(archive, images):
    """Read actual config blobs without extracting or trusting an image-index Id."""
    identities = {}
    with tarfile.open(archive, "r:*") as saved:
        stream = saved.extractfile("manifest.json")
        if stream is None:
            raise RuntimeError("The Docker save archive has no compatibility manifest.")
        records = json.load(stream)
        by_tag = {tag: record for record in records for tag in record.get("RepoTags", [])}
        for role, image in images.items():
            if image not in by_tag:
                raise RuntimeError("The Docker save archive is missing an expected application tag.")
            stream = saved.extractfile(by_tag[image]["Config"])
            if stream is None:
                raise RuntimeError("The Docker save archive is missing an image configuration.")
            blob = stream.read(8 * 1024 * 1024 + 1)
            if len(blob) > 8 * 1024 * 1024:
                raise RuntimeError("An archived image configuration is unexpectedly large.")
            config = json.loads(blob)
            identities[role] = {
                "config_blob_sha256": "sha256:" + hashlib.sha256(blob).hexdigest(),
                "os": config["os"], "architecture": config["architecture"], "variant": config.get("variant", ""),
                "rootfs_diff_ids": config["rootfs"]["diff_ids"],
                "runtime_config_sha256": config_sha256(config.get("config", {})),
            }
    return identities


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--env-file", type=Path, default=ROOT / ".env")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--website-url", type=website_origin, help="HTTPS Cloudflare frontend origin; sets its /login landing page after API OAuth completes.")
    parser.add_argument("--skip-build", action="store_true", help="Only prepare the private env/source bundle.")
    args = parser.parse_args()
    stamp = dt.datetime.now(ZoneInfo("Europe/Paris")).strftime("%Y%m%dT%H%M%S")
    output = (args.output or ROOT / "backup" / ("v6-public-test-" + stamp)).resolve()
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    output.chmod(0o700)
    context = output / "source"
    descriptor = os.open(output / "build.log", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)

    with os.fdopen(descriptor, "wb") as log:
        def command(arguments, *, log_output=True):
            result = subprocess.run(arguments, cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=2400)
            if log_output:
                log.write(result.stdout + result.stderr)
                log.flush()
            if result.returncode:
                raise RuntimeError(f"{Path(arguments[0]).name} failed (exit {result.returncode}); private diagnostics: {output / 'build.log'}")
            return result.stdout

        parsed = command(["bun", "-e", "import dotenv from 'dotenv';import{readFileSync}from'node:fs';process.stdout.write(JSON.stringify(dotenv.parse(readFileSync(process.argv[1]))))", str(args.env_file.resolve(strict=True))], log_output=False)
        values = json.loads(parsed)
        if values.get("DEV") != "true":
            raise RuntimeError("Only an explicitly configured DEV=true local test env is accepted.")
        values.update({
            "DEV": "true", "API_HOST": "v6-gmi-api.linv.dev", "WS_HOST": "v6-gmi-ws.linv.dev",
            "DOMAIN_URL": "https://v6-gmi-api.linv.dev", "WEBSITE_WS_URL": "wss://v6-gmi-ws.linv.dev",
            "MARIA_USER": "v6test", "MARIA_PASSWORD": secrets.token_hex(24),
            "MARIA_ROOT_PASSWORD": secrets.token_hex(24), "MARIA_NAME": "gmi_v6_test",
            "MARIA_HOST": "mariadb", "MARIA_PORT": "3306", "MARIA_CONNECTION_LIMIT": "10",
            "MINIO_ENDPOINT": "http://minio:9000", "MINIO_ACCESS_KEY": "v6test" + secrets.token_hex(7),
            "MINIO_SECRET_KEY": secrets.token_hex(24), "AUTH_TOKEN_ENCRYPTION_KEY": secrets.token_hex(32),
            "PRIVACY_HASH_SECRET": secrets.token_hex(32), "API_REPLICAS": "2", "WEBSOCKET_REPLICAS": "2",
            "DISCORD_REPLICAS": "1", "COMPOSE_PROFILES": "", "DISCORD_RELAY_URL": "http://webhook-relay:3000",
        })
        if args.website_url:
            values["WEBSITE_URL"] = args.website_url
            values["OAUTH_REDIRECT_URL"] = args.website_url + "/login"
        values["OAUTH_PANEL_URL"] = oauth_authorization_url(
            values["OAUTH_PANEL_URL"], values["DISCORD_CLIENT_ID"], values["DOMAIN_URL"],
        )
        for name in ("SENTRY_DSN", "SENTRY_AUTH_TOKEN", "MARIA_URL"):
            values.pop(name, None)

        def write_env(path, mapping):
            content = "".join(key + "='" + str(value).replace("'", "\\'") + "'\n" for key, value in mapping.items())
            handle = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(handle, "w") as stream:
                stream.write(content)

        write_env(output / ".env", values)
        write_env(output / ".relay.env", {"BARER_TOKEN": values["BARER_DISCORD_RELAY"], "APP_PORT": "3000", "APP_HOST": "0.0.0.0"})
        write_env(output / "cloudflared.env", {"TUNNEL_TOKEN": "unused-test-tunnel-managed-separately"})
        # Validation imports only the schema, without initializing clients or the Discord bot.
        command(["bun", "-e", "import dotenv from 'dotenv';import{readFileSync}from'node:fs';import{ConfigSchema}from'./packages/config/src/schema.ts';const r=ConfigSchema.safeParse(dotenv.parse(readFileSync(process.argv[1])));if(!r.success){console.error(r.error.issues.map(i=>i.path.join('.')+':'+i.code).join('\\n'));process.exit(1)}console.log('Test environment schema valid')", str(output / ".env")])

        def excluded(directory, names):
            global_names = {".git", ".terraform", "node_modules", "dist", "coverage", ".turbo", "__pycache__", ".docusaurus", ".solid", ".output"}
            root_names = {"docs", "infra", "logs", "backup", ".github", ".aws", ".agents", ".codex"}
            return {name for name in names if name in global_names or (Path(directory) == ROOT and name in root_names)
                    or name.startswith(".env") or ".tfstate" in name or ".tfvars" in name or name.endswith(".tfplan")}

        print("Freezing the four application images' shared source context.", flush=True)
        shutil.copytree(ROOT, context, ignore=excluded)
        digest = hashlib.sha256()
        for path in sorted(context.rglob("*")):
            if path.is_file():
                digest.update(str(path.relative_to(context)).encode() + b"\0")
                digest.update(path.read_bytes())
                digest.update(b"\0")
        source_sha256 = digest.hexdigest()
        revision = "local-test-v6-" + source_sha256[:40]
        tag = stamp.lower() + "-" + source_sha256[:12]
        images = {role: "gmi-v6-test-" + role + ":" + tag for role in ROLES}
        for name in ("docker-stack.swarm.yml",):
            shutil.copyfile(context / name, output / name)
        for path in (ROOT / "infra/proxmox/files").iterdir():
            if path.is_file():
                shutil.copyfile(path, output / path.name)
        manifest = {
            "created_at": dt.datetime.now(ZoneInfo("Europe/Paris")).isoformat(), "purpose": "public-v6-test",
            "source_sha256": source_sha256, "revision": revision, "images": images,
            "api_url": values["DOMAIN_URL"], "websocket_url": values["WEBSITE_WS_URL"],
            "frontend_url": values.get("WEBSITE_URL"), "oauth_redirect_url": values.get("OAUTH_REDIRECT_URL"),
            "discord_oauth_callback_url": values["DOMAIN_URL"] + "/v3/users/login",
            "frontend_url_was_overridden": args.website_url is not None,
            "requires_image_digest_resolution": True, "tunnel_managed_separately": True,
            "relay": {"network_alias": "webhook-relay", "internal_port": 3000, "env_file": ".relay.env", "publish_host_ports": False},
        }
        manifest_path = output / "release.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        manifest_path.chmod(0o600)
        if args.skip_build:
            print("Private test bundle prepared: " + str(output), flush=True)
            return

        image_ids = {}
        for role, image in images.items():
            print("Building " + role + " from the frozen source snapshot.", flush=True)
            command(["docker", "build", "-f", str(context / f"apps/{role}/Dockerfile"), "-t", image,
                     "--label", "org.opencontainers.image.revision=" + revision, str(context)])
            if role != "webhook-relay":
                command(["docker", "run", "--rm", "--network", "none", "--entrypoint", "/bin/sh", image,
                         "-c", "test ! -e /app/.env && test ! -e /app/.env.test && test ! -e /app/infra && test ! -e /app/.aws"])
            inspected = json.loads(command(["docker", "image", "inspect", image]))[0]
            if inspected.get("Config", {}).get("Labels", {}).get("org.opencontainers.image.revision") != revision:
                raise RuntimeError("An application image has an unexpected source revision.")
            image_ids[role] = {"id": inspected["Id"], "size_bytes": inspected["Size"],
                               "inspect_identity": portable_inspect_identity(inspected)}
        archive = output / "application-images.tar"
        print("Saving the four local application images for private transfer.", flush=True)
        command(["docker", "save", "--output", str(archive), *images.values()])
        archive.chmod(0o600)
        for role, identity in archive_image_identities(archive, images).items():
            image_ids[role]["portable_identity"] = identity
        compressed = output / "application-images.tar.gz"
        with archive.open("rb") as source, gzip.open(compressed, "wb", compresslevel=1) as target:
            shutil.copyfileobj(source, target, length=1024 * 1024)
        compressed.chmod(0o600)
        archive.unlink()
        archive = compressed
        archive_digest = hashlib.sha256()
        with archive.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                archive_digest.update(chunk)
        checksum = archive_digest.hexdigest()
        (output / (archive.name + ".sha256")).write_text(checksum + "  " + archive.name + "\n")
        manifest.update({"image_details": image_ids, "archive": archive.name, "archive_sha256": checksum, "archive_size_bytes": archive.stat().st_size})
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        print(json.dumps({"output": str(output), "revision": revision, "images": image_ids,
                          "archive_size_bytes": archive.stat().st_size, "archive_sha256": checksum}, indent=2), flush=True)


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print("Test release preparation stopped: " + str(error), file=sys.stderr)
        raise SystemExit(1)
