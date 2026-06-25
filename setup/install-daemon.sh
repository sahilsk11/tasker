#!/usr/bin/env sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$script_dir/lib/common.sh"

setup_repo_root
setup_prepare_workspace
pnpm run install-daemon -- "$@"
