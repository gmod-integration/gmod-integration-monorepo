"""Private release preparation must never include env/state in image sources."""
from pathlib import Path
import argparse
import copy
import hashlib
import importlib.util
import io
import json
import subprocess
import sys
import tempfile
import tarfile
import unittest
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/proxmox-test-release.py"
SPEC = importlib.util.spec_from_file_location("proxmox_test_release", SCRIPT)
release = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(release)


class TestReleasePreparation(unittest.TestCase):
    def test_private_bundle_and_source_exclusions_without_docker(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "release"
            result = subprocess.run([sys.executable, str(SCRIPT), "--skip-build", "--env-file", str(ROOT / ".env.test"), "--output", str(output), "--website-url", "https://v6-gmi-web.linv.dev"], capture_output=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            self.assertEqual((output / ".env").stat().st_mode & 0o777, 0o600)
            self.assertEqual(output.stat().st_mode & 0o777, 0o700)
            self.assertFalse((output / "source/.env").exists())
            self.assertFalse((output / "source/.env.test").exists())
            self.assertFalse((output / "source/infra").exists())
            self.assertFalse((output / "source/node_modules").exists())
            self.assertTrue((output / "source/apps/docs/package.json").exists())
            manifest = json.loads((output / "release.json").read_text())
            self.assertEqual(len(manifest["images"]), 4)
            self.assertRegex(manifest["source_sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(manifest["requires_image_digest_resolution"])
            env = (output / ".env").read_text()
            self.assertIn("DEV='true'", env)
            self.assertIn("DOMAIN_URL='https://v6-gmi-api.linv.dev'", env)
            self.assertIn("WEBSITE_URL='https://v6-gmi-web.linv.dev'", env)
            self.assertIn("OAUTH_REDIRECT_URL='https://v6-gmi-web.linv.dev/login'", env)
            authorization = next(line.split("=", 1)[1].strip("'") for line in env.splitlines()
                                 if line.startswith("OAUTH_PANEL_URL="))
            query = parse_qs(urlsplit(authorization).query)
            self.assertEqual(query["client_id"], ["000000000000000000"])
            self.assertEqual(query["redirect_uri"], ["https://v6-gmi-api.linv.dev/v3/users/login"])
            self.assertEqual(manifest["discord_oauth_callback_url"], query["redirect_uri"][0])
            self.assertNotEqual(manifest["discord_oauth_callback_url"], manifest["oauth_redirect_url"])
            self.assertIn("DISCORD_RELAY_URL='http://webhook-relay:3000'", env)
            self.assertNotIn("MARIA_URL=", env)
            self.assertNotIn("SENTRY_DSN=", env)
            self.assertNotIn("MARIA_PASSWORD=", result.stdout.decode())
            self.assertNotIn("BARER_TOKEN=", result.stdout.decode())

    def test_non_test_environment_refused_before_any_build(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            env = directory / "test.env"
            env.write_text("DEV=false\n")
            result = subprocess.run([sys.executable, str(SCRIPT), "--skip-build", "--env-file", str(env), "--output", str(directory / "release")], capture_output=True, timeout=30)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(b"DEV=true", result.stderr)
            self.assertFalse((directory / "release/source").exists())

    def test_api_callback_is_correct_without_overriding_the_source_frontend(self):
        with tempfile.TemporaryDirectory() as temporary:
            output = Path(temporary) / "release"
            result = subprocess.run([sys.executable, str(SCRIPT), "--skip-build", "--env-file", str(ROOT / ".env.test"), "--output", str(output)], capture_output=True, timeout=60)
            self.assertEqual(result.returncode, 0, result.stderr.decode())
            manifest = json.loads((output / "release.json").read_text())
            self.assertEqual(manifest["frontend_url"], "http://localhost:3000")
            self.assertEqual(manifest["oauth_redirect_url"], "http://localhost:3000/oauth/callback")
            self.assertFalse(manifest["frontend_url_was_overridden"])
            self.assertEqual(manifest["discord_oauth_callback_url"], "https://v6-gmi-api.linv.dev/v3/users/login")
            env = (output / ".env").read_text()
            authorization = next(line.split("=", 1)[1].strip("'") for line in env.splitlines()
                                 if line.startswith("OAUTH_PANEL_URL="))
            self.assertEqual(parse_qs(urlsplit(authorization).query)["redirect_uri"], [manifest["discord_oauth_callback_url"]])

    def test_oauth_authorization_keeps_scopes_and_replaces_stale_app_and_callback(self):
        source = "https://discord.com/api/oauth2/authorize?client_id=old&scope=identify%20guilds&redirect_uri=http%3A%2F%2Flocalhost%3A53136%2Fv3%2Fusers%2Flogin&prompt=consent&client_id=another-old&redirect_uri=https%3A%2F%2Fold.example%2Fcallback"
        generated = release.oauth_authorization_url(source, "test-application-id", "https://v6-gmi-api.linv.dev")
        parsed = urlsplit(generated)
        query = parse_qs(parsed.query)
        self.assertEqual((parsed.scheme, parsed.netloc, parsed.path), ("https", "discord.com", "/api/oauth2/authorize"))
        self.assertEqual(query["client_id"], ["test-application-id"])
        self.assertEqual(query["redirect_uri"], ["https://v6-gmi-api.linv.dev/v3/users/login"])
        self.assertEqual(query["scope"], ["identify guilds"])
        self.assertEqual(query["prompt"], ["consent"])

    def test_website_url_accepts_https_origins_and_rejects_paths_or_credentials(self):
        self.assertEqual(release.website_origin("https://v6-gmi-web.linv.dev/"), "https://v6-gmi-web.linv.dev")
        for invalid in ("http://v6-gmi-web.linv.dev", "https://user:pass@v6-gmi-web.linv.dev", "https://v6-gmi-web.linv.dev/login", "https://v6-gmi-web.linv.dev?x=1", "https://bad host.linv.dev", "https://v6-gmi-web.linv.dev:70000"):
            with self.subTest(invalid=invalid), self.assertRaises(argparse.ArgumentTypeError):
                release.website_origin(invalid)

    def test_portable_identity_survives_store_id_difference_but_detects_layer_changes(self):
        local = {"Id": "sha256:" + "1" * 64, "Os": "linux", "Architecture": "amd64", "RootFS": {"Layers": ["sha256:" + "a" * 64]}, "Config": {"Env": ["NODE_ENV=production"], "Cmd": ["bun", "main.ts"]}}
        remote = copy.deepcopy(local)
        remote["Id"] = "sha256:" + "2" * 64
        remote["Config"] = {"Cmd": ["bun", "main.ts"], "Env": ["NODE_ENV=production"]}
        self.assertEqual(release.portable_inspect_identity(local), release.portable_inspect_identity(remote))
        remote["RootFS"]["Layers"] = ["sha256:" + "b" * 64]
        self.assertNotEqual(release.portable_inspect_identity(local), release.portable_inspect_identity(remote))

    def test_archive_identity_is_derived_from_the_saved_config_blob(self):
        config = b'{"os":"linux","architecture":"amd64","rootfs":{"type":"layers","diff_ids":["sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]},"config":{"Cmd":["bun","main.ts"]}}'
        digest = "sha256:" + hashlib.sha256(config).hexdigest()
        config_name = "blobs/sha256/" + digest.split(":")[1]
        records = [{"Config": config_name, "RepoTags": ["fixture/app:test"], "Layers": []}]
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "images.tar.gz"
            with tarfile.open(archive, "w:gz") as saved:
                for name, content in ((config_name, config), ("manifest.json", json.dumps(records).encode())):
                    info = tarfile.TarInfo(name)
                    info.size = len(content)
                    saved.addfile(info, io.BytesIO(content))
            identity = release.archive_image_identities(archive, {"api": "fixture/app:test"})["api"]
            self.assertEqual(identity["config_blob_sha256"], digest)
            self.assertEqual(identity["architecture"], "amd64")
            self.assertEqual(identity["rootfs_diff_ids"], ["sha256:" + "a" * 64])
            with self.assertRaisesRegex(RuntimeError, "missing an expected application tag"):
                release.archive_image_identities(archive, {"api": "other/app:test"})


if __name__ == "__main__":
    unittest.main()
