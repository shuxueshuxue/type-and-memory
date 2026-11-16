#!/usr/bin/env bash
# Start the backend on $1 (default 4319) with a model from an env file that defines
# TAM_LLM_URL / TAM_LLM_KEY / TAM_LLM_MODEL. Prints the pid; stop it with kill <pid>.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . "${TAM_ENV:?path to an env file}"; set +a
PORT="${1:-4319}" exec node server/server.mjs
