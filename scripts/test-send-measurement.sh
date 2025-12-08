#!/bin/bash
# Script de test pour simuler l'envoi d'une mesure comme le fait le dispositif
# Usage: ./scripts/test-send-measurement.sh

ICCID="${1:-8933150821051278837}"
API_URL="${2:-https://ott-jbln.onrender.com}"
FLOW_LPM="${3:-2.5}"
BATTERY="${4:-85}"
RSSI="${5:--75}"
STATUS="${6:-EVENT}"
FIRMWARE_VERSION="${7:-v3.0}"

echo "=== TEST ENVOI MESURE (Simulation Dispositif) ==="
echo ""

# Construire le payload JSON
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
PAYLOAD=$(cat <<EOF
{
  "sim_iccid": "$ICCID",
  "flow_lpm": $FLOW_LPM,
  "battery_percent": $BATTERY,
  "rssi": $RSSI,
  "status": "$STATUS",
  "firmware_version": "$FIRMWARE_VERSION",
  "timestamp": "$TIMESTAMP"
}
EOF
)

echo "📤 Payload JSON:"
echo "$PAYLOAD" | jq .
echo ""

ENDPOINT="$API_URL/api.php/devices/measurements"
echo "🌐 Endpoint: $ENDPOINT"
echo ""

echo "⏳ Envoi de la requête..."
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
  -H "Content-Type: application/json" \
  -H "X-Device-ICCID: $ICCID" \
  -d "$PAYLOAD")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

echo ""
if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 300 ]; then
  echo "✅ SUCCÈS! (HTTP $HTTP_CODE)"
  echo ""
  echo "📥 Réponse de l'API:"
  echo "$BODY" | jq .
  
  SUCCESS=$(echo "$BODY" | jq -r '.success // false')
  if [ "$SUCCESS" = "true" ]; then
    echo ""
    echo "✅ Mesure enregistrée avec succès!"
    DEVICE_ID=$(echo "$BODY" | jq -r '.device_id // "N/A"')
    echo "   Device ID: $DEVICE_ID"
  fi
else
  echo "❌ ERREUR! (HTTP $HTTP_CODE)"
  echo ""
  echo "📥 Réponse d'erreur:"
  echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
  echo ""
  echo "💡 Vérifiez:"
  echo "   - Que l'API est accessible: $API_URL"
  echo "   - Que l'ICCID est correct: $ICCID"
  echo "   - Les logs du serveur pour plus de détails"
fi

echo ""
echo "=== FIN DU TEST ==="

