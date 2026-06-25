#!/usr/bin/env sh
set -eu

setup_repo_root() {
  script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
  cd "$script_dir/.."
}

setup_prepare_workspace() {
  if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
    corepack enable
  fi

  if ! command -v pnpm >/dev/null 2>&1; then
    echo "pnpm is required. Install pnpm or enable it with corepack." >&2
    exit 1
  fi

  pnpm install
}
