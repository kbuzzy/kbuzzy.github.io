#!/usr/bin/env python3
"""
Lightweight file watcher that auto-commits and pushes repo changes.

Usage:
  python3 scripts/auto_push_watcher.py

Optional env vars:
  AUTO_PUSH_INTERVAL_SECONDS   Polling interval, default 5
  AUTO_PUSH_DEBOUNCE_SECONDS   Quiet period before commit/push, default 10
  AUTO_PUSH_MESSAGE_PREFIX     Commit message prefix, default "Auto-update"
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
INTERVAL_SECONDS = float(os.getenv("AUTO_PUSH_INTERVAL_SECONDS", "5"))
DEBOUNCE_SECONDS = float(os.getenv("AUTO_PUSH_DEBOUNCE_SECONDS", "10"))
MESSAGE_PREFIX = os.getenv("AUTO_PUSH_MESSAGE_PREFIX", "Auto-update")

EXCLUDED_DIRS = {
    ".git",
    "backend/venv",
    "backend/__pycache__",
    "frontend/node_modules",
    "frontend/build",
    "__pycache__",
}
EXCLUDED_SUFFIXES = {".pyc"}


def is_excluded(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    if any(rel == excluded or rel.startswith(f"{excluded}/") for excluded in EXCLUDED_DIRS):
        return True
    return path.suffix in EXCLUDED_SUFFIXES


def snapshot() -> dict[str, tuple[int, int]]:
    state: dict[str, tuple[int, int]] = {}
    for path in ROOT.rglob("*"):
        if not path.is_file() or is_excluded(path):
            continue
        stat = path.stat()
        state[path.relative_to(ROOT).as_posix()] = (stat.st_mtime_ns, stat.st_size)
    return state


def run_git(*args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=check,
    )


def has_changes() -> bool:
    result = run_git("status", "--porcelain", check=False)
    return bool(result.stdout.strip())


def commit_and_push() -> None:
    run_git("add", "-A")
    if not has_changes():
        return
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    commit_message = f"{MESSAGE_PREFIX} {timestamp}"
    commit = run_git("commit", "-m", commit_message, check=False)
    if commit.returncode != 0:
        if "nothing to commit" in commit.stdout.lower() or "nothing to commit" in commit.stderr.lower():
            return
        print(commit.stdout, end="")
        print(commit.stderr, end="", file=sys.stderr)
        return
    push = run_git("push", check=False)
    print(commit.stdout, end="")
    print(push.stdout, end="")
    if push.returncode != 0:
        print(push.stderr, end="", file=sys.stderr)


def main() -> int:
    if not (ROOT / ".git").exists():
        print("No .git directory found in repository root.", file=sys.stderr)
        return 1

    print(f"Watching {ROOT}")
    print(f"Polling every {INTERVAL_SECONDS:.0f}s with {DEBOUNCE_SECONDS:.0f}s debounce")

    previous = snapshot()
    last_change_at: float | None = None

    try:
        while True:
            current = snapshot()
            if current != previous:
                previous = current
                last_change_at = time.time()

            if last_change_at is not None and (time.time() - last_change_at) >= DEBOUNCE_SECONDS:
                if has_changes():
                    print("Changes detected, committing and pushing...")
                    commit_and_push()
                last_change_at = None

            time.sleep(INTERVAL_SECONDS)
    except KeyboardInterrupt:
        print("\nWatcher stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
