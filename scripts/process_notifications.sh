#!/bin/bash
# Worker pour traiter la queue de notifications
# À ajouter au crontab : * * * * * /path/to/scripts/process_notifications.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

php scripts/process_notifications.php >> logs/notifications_worker.log 2>&1

