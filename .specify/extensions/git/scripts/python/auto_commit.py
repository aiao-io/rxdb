#!/usr/bin/env python3
"""Git extension: auto_commit.py

Automatically commit changes after a Spec Kit command completes.
Python port of ``auto-commit.sh`` / ``auto-commit.ps1``.
Checks per-command config keys in git-config.yml before committing.

Usage: auto_commit.py <event_name> [generated_message]
       auto_commit.py <event_name> --message-file <path>
  e.g.: auto_commit.py after_specify
  e.g.: auto_commit.py after_specify --message-file /tmp/commit-msg.txt  (commit_style: conventional)

--message-file is the preferred way to supply an agent-generated commit
message: it is read from a file, so its content (quotes, ``$(...)``,
backticks) never passes through a shell command line.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
from pathlib import Path


def _find_project_root(start: Path) -> Path | None:
    current = start
    while True:
        if (current / ".specify").is_dir() or (current / ".git").exists():
            return current
        if current.parent == current:
            return None
        current = current.parent


def _value_after_colon(line: str) -> str:
    return re.sub(r"^[^:]*:\s*", "", line)


def _strip_quotes(value: str) -> str:
    """Strip surrounding whitespace, then one leading quote and all trailing quotes.

    Trimming first matters when the YAML value has trailing whitespace after a
    closing quote (``message: "Done"  ``): stripping quotes anchored to the end
    of string would leave the closing quote dangling (``Done"  ``) because the
    quote is no longer at the end. The PowerShell twin ``.Trim()``s before
    stripping, so trim here too to keep all three script variants in parity.
    """
    value = value.strip()
    value = re.sub(r"^[\"']", "", value)
    return re.sub(r"[\"']*$", "", value)


class _ArgumentError(Exception):
    """Invalid command-line arguments, reported as ``[specify] Error: ...``."""


def _generated_message(args: list[str]) -> str:
    """Return the agent-generated message from ``--message-file <path>`` or a raw argument.

    Mirrors the bash twin's argument loop: a later argument overrides an
    earlier one. The message file is a transport-only artifact, so it is
    deleted as soon as it is read; left in the worktree it would count as an
    untracked change and be swept into the commit by ``git add .``.
    """
    message = ""
    pending = list(args)
    while pending:
        arg = pending.pop(0)
        if arg != "--message-file":
            message = arg
            continue
        path = pending.pop(0) if pending else ""
        if not path:
            raise _ArgumentError("--message-file requires a path argument")
        message_file = Path(path)
        if not message_file.is_file():
            raise _ArgumentError(f"message file '{path}' not found")
        message = message_file.read_text(encoding="utf-8").rstrip("\r\n")
        message_file.unlink(missing_ok=True)
    return message


def _parse_commit_style(config_file: Path) -> str:
    """Read the top-level ``commit_style`` key: ``fixed`` (default) or ``conventional``.

    Mirrors the bash/PowerShell twins: the first ``commit_style:`` line wins,
    a trailing ``# comment`` and surrounding quotes are stripped, the value is
    case-insensitive, and an unknown value warns and falls back to ``fixed``.
    """
    try:
        content = config_file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return "fixed"
    match = re.search(r"^commit_style:(.*)$", content, re.MULTILINE)
    style = _strip_quotes(re.sub(r"\s+#.*$", "", match.group(1))).lower() if match else ""
    if style in ("", "fixed", "conventional"):
        return style or "fixed"
    print(
        f"[specify] Warning: unknown commit_style '{style}' in git-config.yml "
        "(expected 'fixed' or 'conventional'); defaulting to 'fixed'",
        file=sys.stderr,
    )
    return "fixed"


def _parse_auto_commit_config(
    config_file: Path, event_name: str
) -> tuple[bool, str]:
    """Parse the auto_commit section for this event, mirroring the bash line parser.

    Returns (enabled, commit_msg). Looks for auto_commit.<event_name>.enabled
    and .message, with auto_commit.default as fallback.
    """
    enabled = False
    commit_msg = ""
    default_enabled = False
    in_auto_commit = False
    in_event = False

    try:
        content = config_file.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        # Unreadable or non-UTF-8 config is treated like a missing one:
        # auto-commit stays disabled instead of crashing with a traceback.
        return False, ""
    for record in content.splitlines(keepends=True):
        if not record.endswith("\n"):
            break
        line = record[:-1]
        if line.startswith("auto_commit:"):
            in_auto_commit = True
            in_event = False
            continue

        # Exit auto_commit section on next top-level key
        if in_auto_commit and re.match(r"^[a-z]", line):
            break

        if not in_auto_commit:
            continue

        if re.match(r"^\s+default:\s", line):
            value = re.sub(r"\s", "", _value_after_colon(line)).lower()
            if value == "true":
                default_enabled = True

        if re.match(rf"^\s+{re.escape(event_name)}:", line):
            in_event = True
            continue

        if in_event:
            # Exit on next sibling key (same indent level as event name)
            if re.match(r"^\s{2}[a-z]", line) and not re.match(r"^\s{4}", line):
                in_event = False
                continue
            if re.search(r"\s+enabled:", line):
                value = re.sub(r"\s", "", _value_after_colon(line)).lower()
                if value == "true":
                    enabled = True
                elif value == "false":
                    enabled = False
            if re.search(r"\s+message:", line):
                commit_msg = _strip_quotes(_value_after_colon(line))

    # If event-specific key not found, use default — but only if the event
    # section didn't exist at all (an explicit false must win).
    if not enabled and default_enabled:
        if not re.search(rf"^\s*{re.escape(event_name)}:", content, re.MULTILINE):
            enabled = True

    return enabled, commit_msg


def main(argv: list[str]) -> int:
    event_name = argv[0] if argv else ""
    if not event_name:
        print(
            f"Usage: {Path(sys.argv[0]).name} <event_name> [generated_message | --message-file <path>]",
            file=sys.stderr,
        )
        return 1
    try:
        generated_message = _generated_message(argv[1:])
    except _ArgumentError as error:
        print(f"[specify] Error: {error}", file=sys.stderr)
        return 1

    script_dir = Path(__file__).resolve().parent
    repo_root = _find_project_root(script_dir) or Path.cwd()

    if shutil.which("git") is None:
        print("[specify] Warning: Git not found; skipped auto-commit", file=sys.stderr)
        return 0

    probe = subprocess.run(
        ["git", "rev-parse", "--is-inside-work-tree"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        print(
            "[specify] Warning: Not a Git repository; skipped auto-commit",
            file=sys.stderr,
        )
        return 0

    config_file = repo_root / ".specify" / "extensions" / "git" / "git-config.yml"
    if not config_file.is_file():
        # No config file — auto-commit disabled by default
        return 0

    commit_style = _parse_commit_style(config_file)
    enabled, commit_msg = _parse_auto_commit_config(config_file, event_name)
    if not enabled:
        return 0

    # Check if there are changes to commit
    def _quiet(*args: str) -> bool:
        return (
            subprocess.run(
                ["git", *args], cwd=repo_root, capture_output=True, text=True
            ).returncode
            == 0
        )

    untracked = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=repo_root,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if _quiet("diff", "--quiet", "HEAD") and _quiet("diff", "--cached", "--quiet") and not untracked:
        print(f"[specify] No changes to commit after {event_name}", file=sys.stderr)
        return 0

    # In conventional mode, the commit message must be supplied by the agent
    # (--message-file or a raw argument); never fall back to the fixed message.
    if commit_style == "conventional":
        if not generated_message:
            print(
                "[specify] Error: commit_style is 'conventional' but no generated commit "
                "message was supplied; aborting auto-commit (pass --message-file <path>, "
                "or a raw message as arg 2, or set commit_style: fixed)",
                file=sys.stderr,
            )
            return 1
        commit_msg = generated_message

    # Derive a human-readable command name from the event
    # e.g., after_specify -> specify, before_plan -> plan
    command_name = re.sub(r"^(after_|before_)", "", event_name)
    phase = "before" if event_name.startswith("before_") else "after"

    if not commit_msg:
        commit_msg = f"[Spec Kit] Auto-commit {phase} {command_name}"

    steps = [
        (["git", "add", "."], "git add"),
        (["git", "commit", "-q", "-m", commit_msg], "git commit"),
    ]
    for cmd, label in steps:
        result = subprocess.run(cmd, cwd=repo_root, capture_output=True, text=True)
        if result.returncode != 0:
            output = (result.stdout + result.stderr).strip()
            print(f"[specify] Error: {label} failed: {output}", file=sys.stderr)
            return 1

    print(f"[OK] Changes committed {phase} {command_name}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
