"""Offline safety checks; the separate roundtrip script exercises real datastores."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import sys

sys.dont_write_bytecode = True
SPEC = importlib.util.spec_from_file_location("swarm_ops", Path(__file__).parents[1] / "swarm-ops.py")
ops = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ops)


def archive(path, name="./payload", link=False):
    with tarfile.open(path, "w:gz") as target:
        entry = tarfile.TarInfo(name)
        if link:
            entry.type, entry.linkname = tarfile.SYMTYPE, "/etc/passwd"
            target.addfile(entry)
        else:
            entry.size = 7
            target.addfile(entry, io.BytesIO(b"fixture"))


class FakeRuntime:
    stack = "gmi-recovery-test"

    def __init__(self):
        self.resources = {name: {"name": name, "volume": name, "imageId": "sha256:fixture", "replicas": 1} for name in ops.COMPONENTS}
        self.environments = {name: ops.recovery_values(name, {"MARIA_PASSWORD": "fixture-password"}) for name in ops.COMPONENTS}
        self.stopped, self.resumed = False, False

    verify_environment = ops.Runtime.verify_environment

    def stop(self, quiesce):
        if not quiesce:
            raise ops.OperationError("Expected explicit outage authorization")
        self.stopped = True

    def resume(self, *args):
        self.resumed = True


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.environment = self.root / "fixture.env"
        self.environment.write_text("AUTH_TOKEN_ENCRYPTION_KEY=fixture-key\nMARIA_PASSWORD=fixture-password\n")
        self.runtime = FakeRuntime()
        self.bundle = self.root / "backup"

    def tearDown(self):
        self.temporary.cleanup()

    def backup(self):
        with patch.object(ops, "docker"), patch.object(ops, "write_archive", side_effect=lambda path, *args: archive(path)), contextlib.redirect_stdout(io.StringIO()):
            return ops.backup(self.runtime, self.environment, self.bundle, ops.COMPONENTS, quiesce=True)

    def rewrite_manifest(self, change):
        path = self.bundle / "manifest.json"
        manifest = json.loads(path.read_text())
        change(manifest)
        path.write_text(json.dumps(manifest))

    def test_env_parser_never_executes_shell_material_or_interpolates(self):
        marker = self.root / "should-not-exist"
        self.environment.write_text(f"export VALUE='$(touch {marker})'\nOTHER=${{VALUE}}\nMARIADB_PASSWORD=alias\n")
        values = ops.read_env(self.environment)
        self.assertEqual(values["VALUE"], f"$(touch {marker})")
        self.assertEqual(values["OTHER"], "${VALUE}")
        self.assertEqual(values["MARIA_PASSWORD"], "alias")
        self.assertFalse(marker.exists())
        self.environment.write_text("DUP=one\nDUP=two\n")
        with self.assertRaises(ops.OperationError):
            ops.read_env(self.environment)

    def test_restore_forwards_archive_stdin_to_the_container(self):
        command = ops.helper_args("fixture-image", "fixture-volume", writable=True)
        self.assertIn("-i", command)
        self.assertNotIn("-i", ops.helper_args("fixture-image", "fixture-volume"))

    def test_archive_output_is_created_private(self):
        target = self.root / "private-output"
        ops.write_archive(target, [sys.executable, "-c", "import sys; sys.stdout.buffer.write(b'fixture')"])
        self.assertEqual(target.read_bytes(), b"fixture")
        self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_manifest_permissions_checksums_and_completion(self):
        self.backup()
        manifest = ops.verify_backup(self.bundle)
        self.assertTrue(manifest["completed"])
        self.assertEqual(self.bundle.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.bundle / "recovery.env").stat().st_mode & 0o777, 0o600)
        self.assertTrue(self.runtime.stopped and self.runtime.resumed)
        (self.bundle / "redis.tar.gz").write_bytes(b"corrupt")
        with self.assertRaisesRegex(ops.OperationError, "integrity"):
            ops.verify_backup(self.bundle)

    def test_archive_traversal_and_links_rejected_even_with_matching_hash(self):
        for name, link in (("../../outside", False), ("/absolute", False), ("./link", True)):
            with self.subTest(name=name):
                path = self.root / "unsafe.tar.gz"
                archive(path, name, link)
                with self.assertRaises(ops.OperationError):
                    ops.validate_archive(path, False, None)

    def test_backup_failure_has_no_completion_manifest_and_never_resumes(self):
        with patch.object(ops, "docker"), patch.object(ops, "write_archive", side_effect=ops.OperationError("fixture failure")):
            with self.assertRaises(ops.OperationError):
                ops.backup(self.runtime, self.environment, self.bundle, ops.COMPONENTS, quiesce=True)
        self.assertTrue(self.runtime.stopped)
        self.assertFalse(self.runtime.resumed)
        self.assertFalse((self.bundle / "manifest.json").exists())

    def test_restore_rejects_wrong_destination_keys_and_image_before_mutation(self):
        self.backup()
        for scenario in ("confirmation", "credentials", "image"):
            with self.subTest(scenario=scenario):
                self.runtime.stopped = False
                target = self.environment
                confirmation = self.runtime.stack
                if scenario == "confirmation":
                    confirmation = "another-stack"
                elif scenario == "credentials":
                    target = self.root / "wrong.env"
                    target.write_text("AUTH_TOKEN_ENCRYPTION_KEY=wrong-key\n")
                else:
                    self.runtime.resources["redis"]["imageId"] = "sha256:wrong"
                with patch.object(ops, "docker") as docker, patch.object(ops, "run") as run:
                    with self.assertRaises(ops.OperationError):
                        ops.restore(self.runtime, self.bundle, target, confirmation, quiesce=True)
                    docker.assert_not_called()
                    run.assert_not_called()
                self.assertFalse(self.runtime.stopped)

    def test_restore_failure_leaves_writers_stopped(self):
        self.backup()
        self.runtime.resumed = False
        with patch.object(ops, "docker"), patch.object(ops, "run", side_effect=ops.OperationError("fixture failure")):
            with self.assertRaises(ops.OperationError):
                ops.restore(self.runtime, self.bundle, self.environment, self.runtime.stack, quiesce=True, resume=True)
        self.assertTrue(self.runtime.stopped)
        self.assertFalse(self.runtime.resumed)

    def test_effective_recovery_environment_must_match_before_backup_or_restore(self):
        self.runtime.environments["mariadb"]["MARIA_PASSWORD"] = "different-running-password"
        with patch.object(ops, "docker") as docker, patch.object(ops, "run") as run:
            with self.assertRaisesRegex(ops.OperationError, "Effective mariadb"):
                ops.backup(self.runtime, self.environment, self.bundle, ops.COMPONENTS, quiesce=True)
            docker.assert_not_called()
            run.assert_not_called()
        self.assertFalse(self.runtime.stopped)
        self.assertFalse(self.bundle.exists())
        self.runtime.environments["mariadb"]["MARIA_PASSWORD"] = "fixture-password"
        self.backup()
        self.runtime.stopped = False
        self.runtime.environments["mariadb"]["MARIA_PASSWORD"] = "different-target-password"
        with patch.object(ops, "docker") as docker, patch.object(ops, "run") as run:
            with self.assertRaisesRegex(ops.OperationError, "Effective mariadb"):
                ops.restore(self.runtime, self.bundle, self.environment, self.runtime.stack, quiesce=True)
            docker.assert_not_called()
            run.assert_not_called()
        self.assertFalse(self.runtime.stopped)

    def test_recovery_environment_checks_only_component_effective_inputs(self):
        expected = {key: "fixture-" + key for key in ops.RECOVERY_KEYS}
        runtime = object.__new__(ops.Runtime)
        effective = {
            "api": {**expected, "MARIA_ROOT_PASSWORD": "not-used-by-api"},
            "mariadb": {"MARIADB_USER": expected["MARIA_USER"], "MARIADB_PASSWORD": expected["MARIA_PASSWORD"], "MARIADB_DATABASE": expected["MARIA_NAME"], "MARIADB_ROOT_PASSWORD": expected["MARIA_ROOT_PASSWORD"], "AUTH_TOKEN_ENCRYPTION_KEY": "not-used-by-mariadb"},
            "minio": {"MINIO_ROOT_USER": expected["MINIO_ACCESS_KEY"], "MINIO_ROOT_PASSWORD": expected["MINIO_SECRET_KEY"]},
            "mongo": {}, "redis": {},
        }
        runtime.environments = {name: ops.recovery_values(name, values, actual=True) for name, values in effective.items()}
        runtime.verify_environment(expected)
        runtime.environments["api"]["AUTH_TOKEN_ENCRYPTION_KEY"] = "different-effective-key"
        with self.assertRaisesRegex(ops.OperationError, "Effective api"):
            runtime.verify_environment(expected)
        observed = ops.container_environment({"Config": {"Env": ["MARIA_PASSWORD=image-default"]}}, {"Env": ["MARIA_PASSWORD=actual=value"]})
        self.assertEqual(observed["MARIA_PASSWORD"], "actual=value")
        self.assertEqual(ops.recovery_values("api", {"MARIADB_PASSWORD": "alias"}, actual=True)["MARIA_PASSWORD"], "")

    def test_effective_fixture_secrets_are_not_serialized_into_resource_metadata(self):
        labels = {"gmi.recovery.fixture": "gmi-recovery-env"}
        fixture = self.root / "containers.json"
        fixture.write_text(json.dumps({component: component for component in ops.COMPONENTS}))
        def inspect(kind, name):
            if kind == "container":
                return {"Config": {"Labels": labels, "Env": ["MARIADB_PASSWORD=private-value"]}, "Image": "image-id", "Mounts": [{"Destination": ops.COMPONENTS[name], "Type": "volume", "Name": name}], "State": {"Running": False}}
            if kind == "image":
                return {"Config": {"Env": ["AUTH_TOKEN_ENCRYPTION_KEY=private-image-key"]}}
            return {"Driver": "local", "Options": {}, "Labels": labels}
        with patch.object(ops, "inspect", side_effect=inspect):
            runtime = ops.Runtime("gmi-recovery-env", fixture)
        self.assertEqual(runtime.environments["mariadb"]["MARIA_PASSWORD"], "private-value")
        self.assertNotIn("private-value", json.dumps(runtime.resources))
        self.assertNotIn("private-image-key", json.dumps(runtime.resources))

    def test_later_resume_failure_stops_all_previously_started_application_writers(self):
        runtime = object.__new__(ops.Runtime)
        runtime.resources = {name: {"replicas": 1} for name in (*ops.COMPONENTS, *ops.WRITERS)}
        commands = []
        def scale(component, count):
            commands.append((component, count))
            if component == "websocket" and count:
                raise ops.OperationError("startup failed")
        runtime.set_count = scale
        with self.assertRaisesRegex(ops.OperationError, "startup failed"):
            runtime.resume()
        self.assertIn(("api", 1), commands)
        self.assertEqual(commands[-3:], [("api", 0), ("websocket", 0), ("discord", 0)])
        self.assertNotIn(("discord", 1), commands)

    def test_untrusted_manifest_path_and_symlink_rejected(self):
        self.backup()
        self.rewrite_manifest(lambda data: data["files"].update({"../outside": "0" * 64}))
        with self.assertRaises(ops.OperationError):
            ops.verify_backup(self.bundle)
        self.rewrite_manifest(lambda data: data["files"].pop("../outside"))
        (self.bundle / "redis.tar.gz").unlink()
        (self.bundle / "redis.tar.gz").symlink_to(self.environment)
        with self.assertRaises(ops.OperationError):
            ops.verify_backup(self.bundle)

    def test_dry_run_has_no_docker_calls_or_writes(self):
        with patch.object(ops, "docker") as docker, contextlib.redirect_stdout(io.StringIO()):
            ops.main(["backup", "--env-file", str(self.environment), "--stack-name", self.runtime.stack, "--backup-dir", str(self.bundle), "--dry-run"])
            docker.assert_not_called()
        self.assertFalse(self.bundle.exists())

    def test_restore_requires_explicit_destination_and_confirmation(self):
        self.backup()
        with self.assertRaisesRegex(ops.OperationError, "explicit"):
            ops.main(["restore", "--backup-dir", str(self.bundle)])


class DeploymentTests(unittest.TestCase):
    def test_release_keeps_each_local_volume_on_its_original_owner_and_bootstrap_pins_one_manager(self):
        runtime = FakeRuntime()
        for resource in runtime.resources.values():
            resource["mount"] = {"nodeId": "owner-manager"}
            resource["placementConstraints"] = ["node.role == manager", "node.id == owner-manager", "node.labels.data == true"]
        for overlay, owner in ((ops.release_overlay(runtime), "owner-manager"), (ops.release_overlay(bootstrap_node="new-manager"), "new-manager")):
            for component in ops.COMPONENTS:
                constraints = overlay["services"][component]["deploy"]["placement"]["constraints"]
                self.assertIn(f"node.id == {owner}", constraints)
            self.assertTrue(all(overlay["services"][name]["deploy"]["replicas"] == 0 for name in (*ops.WRITERS, "prisma-migrate")))
            self.assertTrue(all(overlay["services"][name]["environment"]["MARIA_PASSWORD"] == "${MARIA_PASSWORD}" for name in (*ops.WRITERS, "prisma-migrate")))
        self.assertIn("node.labels.data == true", ops.release_overlay(runtime)["services"]["redis"]["deploy"]["placement"]["constraints"])

    def test_enabled_or_nonterminal_existing_migration_refuses_maintenance(self):
        for replicas, state in ((1, "complete"), (0, "running"), (0, "preparing")):
            with self.subTest(replicas=replicas, state=state):
                with patch.object(ops, "docker", side_effect=[b"fixture_prisma-migrate\n", b"migration-task"]), patch.object(ops, "inspect", side_effect=[{"Spec": {"Mode": {"Replicated": {"Replicas": replicas}}}}, {"Status": {"State": state}}]):
                    with self.assertRaisesRegex(ops.OperationError, "migration service"):
                        ops.ensure_no_migration("fixture")
        with patch.object(ops, "docker", return_value=b"") as docker, patch.object(ops, "inspect") as inspect:
            ops.ensure_no_migration("fixture")
            self.assertEqual(docker.call_count, 1)
            inspect.assert_not_called()
        with patch.object(ops, "docker", side_effect=[b"fixture_prisma-migrate\n", b"completed-task"]), patch.object(ops, "inspect", side_effect=[{"Spec": {"Mode": {"Replicated": {"Replicas": 0}}}}, {"Status": {"State": "complete"}}]):
            ops.ensure_no_migration("fixture")
        with patch.object(ops, "docker", side_effect=ops.OperationError("daemon unavailable")):
            with self.assertRaisesRegex(ops.OperationError, "daemon unavailable"):
                ops.ensure_no_migration("fixture")

    def test_mutable_or_mixed_application_images_cannot_begin_maintenance(self):
        args = ops.parser().parse_args(["deploy", "--quiesce", "--bootstrap", "--stack-name", "fixture"])
        args.env_file = Path("/tmp/fixture.env")
        values = {name: "fixture" for name in ("API_HOST", "WS_HOST", "MARIA_USER", "MARIA_PASSWORD", "MARIA_NAME", "MARIA_ROOT_PASSWORD", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY")}
        with patch.dict(os.environ, {}, clear=True), patch.object(ops, "docker") as docker:
            with self.assertRaisesRegex(ops.OperationError, "immutable"):
                ops.deploy(args, values)
            docker.assert_not_called()
        values.update({key: "fixture@sha256:" + "a" * 64 for key in ("API_IMAGE", "WEBSOCKET_IMAGE", "DISCORD_IMAGE")})
        labels = [{"Config": {"Labels": {"org.opencontainers.image.revision": value * 40}}} for value in ("a", "b", "a")]
        with patch.dict(os.environ, {}, clear=True), patch.object(ops, "docker") as docker, patch.object(ops, "inspect", side_effect=labels), patch.object(ops, "run") as run:
            with self.assertRaisesRegex(ops.OperationError, "revisions differ"):
                ops.deploy(args, values)
            self.assertTrue(all(call.args[0] == "pull" for call in docker.call_args_list))
            run.assert_not_called()

    def test_failed_migration_never_enables_app_writers(self):
        args = ops.parser().parse_args(["deploy", "--quiesce", "--bootstrap", "--stack-name", "fixture"])
        args.env_file = Path("/tmp/fixture.env")
        values = {name: "fixture" for name in ("API_HOST", "WS_HOST", "MARIA_USER", "MARIA_PASSWORD", "MARIA_NAME", "MARIA_ROOT_PASSWORD", "MINIO_ACCESS_KEY", "MINIO_SECRET_KEY")}
        values.update({key: "fixture@sha256:" + "a" * 64 for key in ("API_IMAGE", "WEBSOCKET_IMAGE", "DISCORD_IMAGE")})
        previous_seen = False
        commands = []

        def docker(*command):
            nonlocal previous_seen
            commands.append(command)
            if command[:1] == ("info",):
                return json.dumps({"ControlAvailable": True, "NodeID": "owner-manager"}).encode()
            if command[:2] == ("service", "ps"):
                result = b"newtask" if previous_seen else b""
                previous_seen = True
                return result
            return b""

        def run(command, **kwargs):
            overlay = json.loads(Path(command[command.index("-c", command.index("-c") + 1) + 1]).read_text())
            self.assertEqual(overlay["services"]["prisma-migrate"]["deploy"]["replicas"], 0)
            for component in ops.COMPONENTS:
                self.assertIn("node.id == owner-manager", overlay["services"][component]["deploy"]["placement"]["constraints"])
            return b""

        def inspect(kind, name):
            return {"Config": {"Labels": {"org.opencontainers.image.revision": "a" * 40}}} if kind == "image" else {"Status": {"State": "failed"}}

        with patch.object(ops, "docker", side_effect=docker), patch.object(ops, "run", side_effect=run), patch.object(ops, "inspect", side_effect=inspect):
            with self.assertRaisesRegex(ops.OperationError, "Migration failed"):
                ops.deploy(args, values)
        self.assertFalse(any(command[:2] == ("service", "scale") for command in commands))
        updates = [command for command in commands if command[:2] == ("service", "update")]
        self.assertEqual(len(updates), 1)
        self.assertIn("--replicas", updates[0])


if __name__ == "__main__":
    unittest.main()
