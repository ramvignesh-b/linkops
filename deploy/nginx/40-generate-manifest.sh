#!/bin/sh
set -e

# If ASSISTANT_REMOTE_URL is provided, override federation.manifest.json dynamically
if [ -n "$ASSISTANT_REMOTE_URL" ]; then
  echo "Configuring Assistant Module Federation remote URL: $ASSISTANT_REMOTE_URL"
  cat <<EOF > /usr/share/nginx/html/federation.manifest.json
{
  "assistant": "${ASSISTANT_REMOTE_URL}"
}
EOF
fi
