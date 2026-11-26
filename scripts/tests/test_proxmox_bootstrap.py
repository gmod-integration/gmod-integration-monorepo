"""Safety guards for the empty-target Compose bootstrap. No Docker daemon is changed."""
from __future__ import annotations

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("proxmox_ops", ROOT / "infra/proxmox/files/proxmox-ops.py")
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)


def configuration():
    services = {
        name: {"image": "fixture/" + ("api" if name == "prisma-migrate" else name) + "@sha256:" + "a" * 64}
        for name in (*ops.WRITERS, *ops.DATASTORES, "traefik", "prisma-migrate", "cloudflared")
    }
    for name in (*ops.WRITERS, "prisma-migrate"):
        services[name]["deploy"] = {"replicas": 0}
    services["api"]["environment"] = {"API_REPLICAS": "2", "WEBSOCKET_REPLICAS": "2", "DISCORD_REPLICAS": "1"}
    services["traefik"]["ports"] = [{"host_ip": "127.0.0.1", "target": 80, "published": "80"}]
    return {"services": services,
            "volumes": {f"gmod_{name}_data": {"name": f"gmod_gmod_{name}_data"} for name in ops.DATASTORES},
            "networks": {"gmod_net": {"name": "gmod_net", "driver": "bridge"}}}


class BootstrapGuards(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.runtime = ops.Bootstrap(Path(self.directory.name), "gmod")
        self.runtime.configuration = configuration()

    def test_mutable_image_rejected_before_docker_mutation(self):
        self.runtime.configuration["services"]["redis"]["image"] = "redis:latest"
        with patch.object(self.runtime, "docker") as docker, self.assertRaisesRegex(ops.OperationError, "immutable"):
            self.runtime.preflight()
        docker.assert_not_called()

    def test_plain_compose_cannot_enable_writers(self):
        for name in (*ops.WRITERS, "prisma-migrate"):
            with self.subTest(name=name):
                self.runtime.configuration = configuration()
                self.runtime.configuration["services"][name]["deploy"]["replicas"] = 1
                with self.assertRaisesRegex(ops.OperationError, "zero replicas"):
                    self.runtime.config()

    def test_dashboard_and_public_datastores_rejected(self):
        self.runtime.configuration["services"]["traefik"]["command"] = ["--api.insecure=true"]
        with self.assertRaisesRegex(ops.OperationError, "management API"):
            self.runtime.config()
        self.runtime.configuration = configuration()
        self.runtime.configuration["services"]["mariadb"]["ports"] = [{"published": "3306"}]
        with self.assertRaisesRegex(ops.OperationError, "Only Traefik"):
            self.runtime.config()

    def test_discord_cannot_have_multiple_gateway_workers(self):
        self.runtime.configuration["services"]["api"]["environment"]["DISCORD_REPLICAS"] = "2"
        with self.assertRaisesRegex(ops.OperationError, "exactly one Discord"):
            self.runtime.config()

    def test_preexisting_volume_rejected_even_when_unlabelled(self):
        def docker(*arguments, **kwargs):
            return b"gmod_gmod_mariadb_data\n" if arguments[:2] == ("volume", "ls") and "--format" in arguments else b""
        with patch.object(self.runtime, "docker", side_effect=docker), self.assertRaisesRegex(ops.OperationError, "already exist"):
            self.runtime.empty_target()

    def test_preexisting_container_rejected_before_pull(self):
        with patch.object(self.runtime, "docker", return_value=b"old-container"), patch.object(self.runtime, "image_check") as image_check:
            with self.assertRaisesRegex(ops.OperationError, "already exist"):
                self.runtime.preflight(pull=True)
        image_check.assert_not_called()

    def test_revision_mismatch_refused(self):
        def docker(*arguments):
            revision = "other" if "websocket@" in arguments[-1] else "same"
            return json.dumps([{"Config": {"Labels": {"org.opencontainers.image.revision": revision}}}]).encode()
        with patch.object(self.runtime, "docker", side_effect=docker), self.assertRaisesRegex(ops.OperationError, "same source revision"):
            self.runtime.image_check()

    def test_migration_failure_never_starts_writers_and_stops_partial_services(self):
        self.runtime.config()
        commands = []
        def call(*arguments):
            commands.append(arguments)
            if arguments[0] == "run" and arguments[-1] == "prisma-migrate":
                raise ops.OperationError("migration failed")
            return b""
        with patch.object(self.runtime, "preflight"), patch.object(self.runtime, "call", side_effect=call), patch.object(self.runtime, "stop_writers") as stop:
            with self.assertRaisesRegex(ops.OperationError, "migration failed"), contextlib.redirect_stdout(io.StringIO()):
                self.runtime.bootstrap("gmod")
        self.assertEqual(commands[1][-4:], ops.DATASTORES)
        self.assertFalse(any("--scale" in command for command in commands))
        stop.assert_called_once()
        self.assertFalse((self.runtime.directory / ".bootstrap-complete").exists())

    def test_success_orders_migration_verification_writers_and_ingress(self):
        self.runtime.config()
        self.runtime.revision = "fixture"
        commands = []
        with patch.object(self.runtime, "preflight"), patch.object(self.runtime, "call", side_effect=lambda *args: commands.append(args) or b""), patch.object(self.runtime, "wait_for_writers"):
            with contextlib.redirect_stdout(io.StringIO()):
                self.runtime.bootstrap("gmod")
        self.assertEqual(commands[0][-1], "await import('@gmod/config')")
        self.assertEqual(commands[1][-4:], ops.DATASTORES)
        self.assertEqual(commands[2][-1], "prisma-migrate")
        self.assertEqual(commands[3][-1], "scripts/swarm-migration-status.ts")
        self.assertIn("--scale", commands[4])
        self.assertEqual(commands[5][-1], "traefik")
        self.assertFalse(any("cloudflared" in command for command in commands))
        self.assertTrue((self.runtime.directory / ".bootstrap-complete").exists())

    def test_partial_writer_start_failure_stops_writers_without_exposing_ingress(self):
        self.runtime.config()
        commands = []
        with patch.object(self.runtime, "preflight"), patch.object(self.runtime, "call", side_effect=lambda *args: commands.append(args) or b""), patch.object(self.runtime, "wait_for_writers", side_effect=ops.OperationError("not ready")), patch.object(self.runtime, "stop_writers") as stop:
            with self.assertRaisesRegex(ops.OperationError, "not ready"), contextlib.redirect_stdout(io.StringIO()):
                self.runtime.bootstrap("gmod")
        self.assertTrue(any("--scale" in command for command in commands))
        self.assertFalse(any(command[-1] == "traefik" for command in commands))
        stop.assert_called_once()
        self.assertFalse((self.runtime.directory / ".bootstrap-complete").exists())

    def test_cleanup_only_stops_labelled_project_oneoffs(self):
        self.runtime.config()
        commands = []
        def run(arguments, **options):
            commands.append(arguments)
            return subprocess.CompletedProcess(arguments, 0, b"owned-oneoff\n" if arguments[1] == "ps" else b"", b"")
        with patch.object(self.runtime, "run", side_effect=run):
            self.runtime.stop_writers()
        self.assertIn("label=com.docker.compose.project=gmod", commands[1])
        self.assertEqual(commands[2][-1], "owned-oneoff")
        self.assertNotIn("gmod-prisma-bootstrap", commands[2])

    def test_incorrect_confirmation_has_no_commands(self):
        with patch.object(self.runtime, "preflight") as preflight, self.assertRaisesRegex(ops.OperationError, "exactly match"):
            self.runtime.bootstrap("another-project")
        preflight.assert_not_called()

    def test_external_driver_or_custom_volume_name_refused(self):
        volume = self.runtime.configuration["volumes"]["gmod_mariadb_data"]
        volume["external"] = True
        with self.assertRaisesRegex(ops.OperationError, "external"):
            self.runtime.config()

    def test_shell_image_overrides_do_not_replace_reviewed_bundle(self):
        with patch.dict(os.environ, {"API_IMAGE": "injected:latest", "COMPOSE_PROFILES": "tunnel", "GMOD_INGRESS_PORT": "12345"}):
            runtime = ops.Bootstrap(self.runtime.directory, "gmod")
        self.assertNotIn("API_IMAGE", runtime.environment)
        self.assertNotIn("COMPOSE_PROFILES", runtime.environment)
        self.assertNotIn("GMOD_INGRESS_PORT", runtime.environment)

    def test_failed_command_diagnostics_are_private_and_not_in_exception(self):
        result = subprocess.CompletedProcess(["docker"], 1, b"private-token", b"database-record")
        with patch.object(subprocess, "run", return_value=result), self.assertRaises(ops.OperationError) as raised:
            self.runtime.run(["docker", "fixture"])
        self.assertNotIn("private-token", str(raised.exception))
        logs = list(self.runtime.directory.glob(".bootstrap-diagnostic-*.log"))
        self.assertEqual(len(logs), 1)
        self.assertEqual(logs[0].stat().st_mode & 0o777, 0o600)
        self.assertIn(b"private-token", logs[0].read_bytes())

    def test_legacy_timer_update_is_refused_without_docker_operations(self):
        result = subprocess.run(["bash", str(ROOT / "infra/proxmox/files/gmodctl.sh"), "update"], capture_output=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn(b"automatic/in-place deployment is disabled", result.stderr)


@unittest.skipUnless(shutil.which("docker"), "Docker Compose CLI is required for configuration rendering")
class ComposeRendering(unittest.TestCase):
    def test_actual_override_is_private_and_keeps_writers_disabled(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            shutil.copy(ROOT / "docker-stack.swarm.yml", directory)
            shutil.copy(ROOT / "infra/proxmox/files/compose.proxmox.yml", directory)
            values = {key: "fixture/image@sha256:" + "a" * 64 for key in (
                "API_IMAGE", "WEBSOCKET_IMAGE", "DISCORD_IMAGE", "MARIADB_IMAGE", "MONGO_IMAGE", "REDIS_IMAGE", "MINIO_IMAGE", "TRAEFIK_IMAGE", "CLOUDFLARED_IMAGE")}
            values.update({"API_HOST": "api.fixture.invalid", "WS_HOST": "ws.fixture.invalid", "MARIA_ROOT_PASSWORD": "fixture-only",
                           "MARIA_NAME": "fixture", "MARIA_USER": "fixture", "MARIA_PASSWORD": "fixture-only", "MINIO_ACCESS_KEY": "fixture-only",
                           "MINIO_SECRET_KEY": "fixture-only", "COMPOSE_PROFILES": "", "API_REPLICAS": "2", "WEBSOCKET_REPLICAS": "2", "DISCORD_REPLICAS": "1"})
            (directory / ".env").write_text("".join(f"{key}='{value}'\n" for key, value in values.items()))
            (directory / "cloudflared.env").write_text("# disabled in local test\n")
            runtime = ops.Bootstrap(directory, "gmod")
            rendered = runtime.config()
            self.assertIn('--providers.docker.constraints=Label(`com.docker.compose.project`,`gmod`)',
                          rendered["services"]["traefik"]["command"])
            self.assertEqual(runtime.counts, {"api": 2, "websocket": 2, "discord": 1})
            self.assertFalse(runtime.tunnel)
            for name in (*ops.WRITERS, "prisma-migrate"):
                self.assertEqual(rendered["services"][name]["deploy"]["replicas"], 0)
            self.assertIn("scripts/swarm-migrate.ts", rendered["services"]["prisma-migrate"]["command"][-1])
            self.assertNotIn("db push", rendered["services"]["prisma-migrate"]["command"][-1])
            self.assertEqual(rendered["services"]["redis"]["command"][2], "768mb")
            # Each proxy must discover only its own project's containers even when two
            # Compose stacks use identical api/websocket router names on the same daemon.
            fixture = ops.Bootstrap(directory, "gmi-bootstrap-0123456789ab")
            fixture_rendered = fixture.config()
            self.assertIn('--providers.docker.constraints=Label(`com.docker.compose.project`,`gmi-bootstrap-0123456789ab`)',
                          fixture_rendered["services"]["traefik"]["command"])
            # Host networking refers to the CT: connector metrics must not listen on its bridge.
            with (directory / ".env").open("a") as stream:
                stream.write("COMPOSE_PROFILES='tunnel'\n")
            tunnel = ops.Bootstrap(directory, "gmod")
            tunnel_rendered = tunnel.config()
            self.assertTrue(tunnel.tunnel)
            connector_command = tunnel_rendered["services"]["cloudflared"]["command"]
            self.assertEqual(connector_command[connector_command.index("--metrics") + 1], "127.0.0.1:20241")


if __name__ == "__main__":
    unittest.main()
