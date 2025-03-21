#!/bin/bash
source .env

# Use the full path format for Grafana Cloud
# Different hosted instances may have different path requirements
echo "Testing Loki authentication with curl..."
echo "URL: $LOKI_HOST/loki/api/v1/push"
echo "Username: $LOKI_USERNAME"

# Create a simple JSON payload
TIMESTAMP=$(date +%s)000000000
JSON_PAYLOAD='{
  "streams": [
    {
      "stream": {
        "app": "curl-test",
        "environment": "test",
        "source": "curl-script"
      },
      "values": [
        ["'$TIMESTAMP'", "Updated curl test log message with new API key"]
      ]
    }
  ]
}'

echo "Attempting with basic auth..."
# Try with basic auth
curl -v -X POST "$LOKI_HOST/loki/api/v1/push" \
  -H "Content-Type: application/json" \
  -H "X-Scope-OrgID: $LOKI_USERNAME" \
  -u "$LOKI_USERNAME:$LOKI_PASSWORD" \
  -d "$JSON_PAYLOAD"

echo -e "\n\nDone!" 