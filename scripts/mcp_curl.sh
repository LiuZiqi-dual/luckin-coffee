#!/usr/bin/env bash
# mcp_curl.sh — talk to the my-coffee MCP over plain HTTP with a Bearer token,
# so the skill can run even when the MCP server is NOT registered as a client
# tool (zero-config path). This is standard MCP-over-HTTP (JSON-RPC 2.0); the
# endpoint and headers are the server's public contract.
#
# The token is read from the environment (or an opt-in file) and is NEVER
# written or printed by this script — it only travels inside the curl call.
#
# Usage:
#   bash mcp_curl.sh list
#   bash mcp_curl.sh call <toolName> '<argsJSON>'
#
# Token resolution (first non-empty wins):
#   $LUCKIN_MCP_TOKEN  ->  $ORDER_COFFEE_TOKEN  ->  file ~/.order-coffee/token
# Endpoint: $LUCKIN_MCP_URL, else the default below.
set -euo pipefail

URL="${LUCKIN_MCP_URL:-https://gwmcp.lkcoffee.com/order/user/mcp}"

# --- resolve token (never printed, never written) ---
TOKEN="${LUCKIN_MCP_TOKEN:-${ORDER_COFFEE_TOKEN:-}}"
if [ -z "$TOKEN" ] && [ -f "$HOME/.order-coffee/token" ]; then
  TOKEN="$(tr -d '\r\n' < "$HOME/.order-coffee/token")"
fi
if [ -z "$TOKEN" ]; then
  echo 'MCP_CURL_ERR>>>no token (set $LUCKIN_MCP_TOKEN or ~/.order-coffee/token)' >&2
  exit 3
fi

# --- build the JSON-RPC request (node validates/escapes the args) ---
cmd="${1:-}"
case "$cmd" in
  list)
    payload='{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
    ;;
  call)
    name="${2:-}"; args="${3:-}"; [ -n "$args" ] || args='{}'
    [ -n "$name" ] || { echo "usage: mcp_curl.sh call <tool> '<argsJSON>'" >&2; exit 2; }
    if ! payload="$(TOOL="$name" ARGS="$args" node -e \
      'process.stdout.write(JSON.stringify({jsonrpc:"2.0",id:1,method:"tools/call",params:{name:process.env.TOOL,arguments:JSON.parse(process.env.ARGS||"{}")}}))' \
      2>/dev/null)"; then
      echo "MCP_CURL_ERR>>>invalid args JSON: $args" >&2; exit 2
    fi
    ;;
  *)
    echo "usage: mcp_curl.sh <list | call <tool> '<argsJSON>'>" >&2; exit 2
    ;;
esac

# --- call; Streamable HTTP may answer as SSE, so unwrap any `data:` lines ---
resp="$(curl -s -N --max-time 30 "$URL" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d "$payload")"

if printf '%s' "$resp" | grep -q '^data:'; then
  printf '%s' "$resp" | sed -n 's/^data:[[:space:]]\{0,1\}//p'
else
  printf '%s\n' "$resp"
fi
