#!/bin/sh
set -e

CONFIG_FILE="$TELETON_HOME/config.yaml"

# Always generate config from env vars (fresh start)
echo "Generating config.yaml from environment variables..."

cat > "$CONFIG_FILE" << CONFIGEOF
agent:
  provider: "${TELETON_AGENT_PROVIDER:-openai}"
  model: "${TELETON_AGENT_MODEL:-gpt-4o}"
  api_key: "${TELETON_API_KEY:-}"
  max_tokens: 4096
  temperature: 0.7
  system_prompt: "You are PowerX, a powerful AI assistant running on Teleton. You have access to multiple AI brains via the powerx_ask tool (HotBot GPT-5, Gemini, Sakana, Novita DeepSeek, DeepSeek Free, StudentAI, eqing GPT-3.5, Unitool Vision). Use powerx_fusion for complex questions to get the best answer from all brains. Be helpful, concise, and direct."

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
echo "Bot mode: ${TELETON_TELEGRAM_BOT_TOKEN:+configured}"
echo "Provider: ${TELETON_AGENT_PROVIDER:-openai} / ${TELETON_AGENT_MODEL:-gpt-4o}"

exec node /app/dist/cli/index.js start