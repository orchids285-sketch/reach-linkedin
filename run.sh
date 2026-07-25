#!/usr/bin/env bash
# reach-linkedin — start the gateway + a free public tunnel (macOS / Linux).
#
# Prereqs (one-time):
#   npx -y patchright install chrome
#   npx -y linkedin-mcp-tools@latest --login   # log into YOUR LinkedIn, solve 2FA
#
# Then:
#   export GATEWAY_TOKEN="<the LINKEDIN_MCP_TOKEN from Reach>"
#   ./run.sh
#
# Prints a https://<something>.trycloudflare.com URL — send it to your operator
# so Reach's LINKEDIN_MCP_URL is pointed at it. Keep this running: LinkedIn
# sending only works while this gateway + tunnel are up.
set -euo pipefail

if [ -z "${GATEWAY_TOKEN:-}" ]; then
  echo "ERROR: export GATEWAY_TOKEN first (the LINKEDIN_MCP_TOKEN value from Reach)." >&2
  exit 1
fi

PORT="${PORT:-8080}"
echo "[reach-linkedin] starting gateway on :$PORT ..."
node index.mjs &
GW_PID=$!
trap 'kill "$GW_PID" 2>/dev/null || true' EXIT
sleep 4

echo "[reach-linkedin] opening public tunnel (free, no account) ..."
npx --yes untun@latest tunnel "http://localhost:$PORT"
