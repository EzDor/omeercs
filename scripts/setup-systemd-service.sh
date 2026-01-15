#!/bin/bash
set -e

SERVICE_NAME="${1:?Service name required}"
CONTAINER_NAME="${2:-$SERVICE_NAME}"

echo "Creating systemd service for $SERVICE_NAME..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=${SERVICE_NAME} Docker Container
Requires=docker.service
After=docker.service

[Service]
Type=simple
Restart=always
RestartSec=10
ExecStart=/usr/bin/docker start -a ${CONTAINER_NAME}
ExecStop=/usr/bin/docker stop ${CONTAINER_NAME}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
echo "Systemd service ${SERVICE_NAME} created and enabled"
