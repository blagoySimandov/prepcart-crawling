#!/bin/bash

# Update crawler schedule without redeploying
# Usage: ./schedule-crawler.sh <crawler-name> <schedule> [region] [project-id]

set -e

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: ./schedule-crawler.sh <crawler-name> <schedule> [region] [project-id]"
    echo "Example: ./schedule-crawler.sh bila-bulgaria \"0 6 * * *\""
    echo ""
    echo "Common schedules:"
    echo "  \"0 9 * * 1\"     - Weekly Monday 9 AM"
    echo "  \"0 6 * * *\"     - Daily 6 AM"
    echo "  \"0 */6 * * *\"   - Every 6 hours"
    echo "  \"0 9 * * 1,3,5\" - Mon, Wed, Fri 9 AM"
    exit 1
fi

CRAWLER_NAME=$1
SCHEDULE=$2
REGION=${3:-"europe-west1"}
PROJECT_ID=${4:-$(gcloud config get-value project)}
SCHEDULER_NAME="prepcart-schedule-${CRAWLER_NAME}"

echo "⏰ Updating schedule for: ${CRAWLER_NAME}"
echo "📅 New schedule: ${SCHEDULE}"

gcloud scheduler jobs update http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="${SCHEDULE}" \
    --quiet

echo "✅ Schedule updated successfully!"
echo "📋 View scheduler: gcloud scheduler jobs describe ${SCHEDULER_NAME} --location=${REGION}" 