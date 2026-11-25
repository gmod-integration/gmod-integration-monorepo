#!/usr/bin/env python3
"""Validate and run mocked plan tests without loading local secrets or Terraform state."""

from pathlib import Path
import os
import shutil
import subprocess
import tempfile


def main():
    source = Path(__file__).resolve().parents[1]
    root = source.parents[1]
    # Terraform automatically reads *.tfvars and TF_VAR_*. Keep both out of the test directory.
    environment = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith(("TF_VAR_", "TF_CLI_ARGS", "TF_LOG"))
        and key not in {"TF_WORKSPACE", "TF_DATA_DIR", "TF_CLI_CONFIG_FILE"}
    }
    environment["TF_IN_AUTOMATION"] = "1"
    with tempfile.TemporaryDirectory(prefix="gmi-terraform-test-") as temporary:
        destination = Path(temporary) / "infra" / "proxmox"
        destination.mkdir(parents=True)
        for path in source.glob("*.tf"):
            shutil.copy2(path, destination / path.name)
        shutil.copy2(source / ".terraform.lock.hcl", destination)
        shutil.copytree(source / "files", destination / "files")
        shutil.copytree(source / "tests", destination / "tests", ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
        for name in ("docker-stack.swarm.yml", ".env.example"):
            shutil.copy2(root / name, Path(temporary) / name)
        terraform = ["terraform", "-chdir=" + str(destination)]
        initialize = [*terraform, "init", "-backend=false", "-input=false", "-lockfile=readonly", "-no-color"]
        cache = source / ".terraform" / "providers"
        if cache.is_dir():
            initialize.append("-plugin-dir=" + str(cache))
        subprocess.run(initialize, env=environment, check=True)
        subprocess.run([*terraform, "validate", "-no-color"], env=environment, check=True)
        subprocess.run([*terraform, "test", "-no-color"], env=environment, check=True)


if __name__ == "__main__":
    main()
