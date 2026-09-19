#!/bin/bash

set -euo pipefail

NODE_PATH="${NODE_PATH:-$(command -v node || true)}"

if [ -z "$NODE_PATH" ]; then
  echo "error: node binary not found (set NODE_PATH to override)" >&2
  exit 1
fi

SERVICE_NAME="ashbringer-backend"

SERVICE_PATH_APP="${SERVICE_PATH_APP:-.dist-backend/main.js}"
SERVICE_DIR="${SERVICE_DIR:-/etc/systemd/system}"
# The repository root: build output lives here, and so does .env, which dotenv
# resolves from the working directory.
SERVICE_PATH="$(cd "$(dirname "$0")/.." && pwd)/"
SERVICE_FILE="$SERVICE_DIR/${SERVICE_NAME}.service"

echo "> Installing systemd service (${SERVICE_FILE})..."

bash -c "cat > \"$SERVICE_FILE\"" <<EOF
[Unit]
Description=AshBringer Backend
After=network.target

[Service]
RestartSec=5
Restart=always
WorkingDirectory=$SERVICE_PATH
ExecStart=$NODE_PATH $SERVICE_PATH$SERVICE_PATH_APP

StandardOutput=file:$SERVICE_PATH/log_output.log
StandardError=file:$SERVICE_PATH/log_error.log

LimitNOFILE=1048576

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

echo "> Service Installed."
