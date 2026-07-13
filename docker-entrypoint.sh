#!/bin/sh
set -e

CONFIG_FILE="$TELETON_HOME/config.yaml"

# Always generate config from env vars
echo "Generating config.yaml from environment variables..."

cat > "$CONFIG_FILE" << CONFIGEOF
agent:
  provider: "${TELETON_AGENT_PROVIDER:-openai}"
  model: "${TELETON_AGENT_MODEL:-gpt-4o}"
  api_key: "${TELETON_API_KEY:-}"
  max_tokens: 4096
  temperature: 0.7
  system_prompt: "You are PowerX, an autonomous AI assistant running on Telegram. You have access to the full Teleton toolset including web search, file operations, and more. Be helpful, concise, and direct."

telegram:
  mode: "bot"
  bot_token: "${TELETON_TELEGRAM_BOT_TOKEN}"
  owner_id: ${TELETON_TELEGRAM_OWNER_ID:-0}
  dm_policy: "open"
  group_policy: "open"
  require_mention: true

webui:
  enabled: ${TELETON_WEBUI_ENABLED:-true}
  host: "${TELETON_WEBUI_HOST:-0.0.0.0}"
  port: ${TELETON_WEBUI_PORT:-7777}

logging:
  level: "${TELETON_LOG_LEVEL:-info}"
  pretty: false

plugins:
  powerx:
    hotbot_key: "${POWERX_HOTBOT_KEY:-}"
    gemini_key: "${POWERX_GEMINI_KEY:-}"
    novita_key: "${POWERX_NOVITA_KEY:-}"
    deepseek_token: "${POWERX_DEEPSEEK_TOKEN:-}"
    sakana_enabled: ${POWERX_SAKANA_ENABLED:-true}
    studentai_enabled: ${POWERX_STUDENTAI_ENABLED:-true}
    eqing_enabled: ${POWERX_EQING_ENABLED:-true}
    unitool_enabled: ${POWERX_UNITOOL_ENABLED:-true}

capabilities:
  exec:
    mode: "off"

tool_rag:
  enabled: true

heartbeat:
  enabled: false
CONFIGEOF

echo "Config created at $CONFIG_FILE"
echo "Starting PowerX Teleton Agent..."
echo "Bot token: ${TELETON_TELEGRAM_BOT_TOKEN:+configured (${TELETON_TELEGRAM_BOT_TOKEN%%:*})}"
echo "Owner ID: ${TELETON_TELEGRAM_OWNER_ID:-not set}"
echo "Provider: ${TELETON_AGENT_PROVIDER:-openai} / ${TELETON_AGENT_MODEL:-gpt-4o}"

# Find the correct entrypoint
if [ -f /app/dist/cli/index.js ]; then
  exec node /app/dist/cli/index.js start
elif [ -f /app/dist/index.js ]; then
  exec node /app/dist/index.js start
else
  echo "Looking for entrypoint..."
  find /app -name "index.js" -path "*/cli/*" 2>/dev/null | head -5
  # Try common locations
  for path in /app/cli/index.js /app/bin/cli.js /app/src/cli/index.ts; do
    if [ -f "$path" ]; then
      echo "Found: $path"
      exec node "$path" start 2>/dev/null || true
    fi
  done
  echo "ERROR: Could not find Teleton entrypoint"
  exit 1
fi