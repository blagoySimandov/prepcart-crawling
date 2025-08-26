#!/bin/bash

# Deploy all crawlers as scheduled Cloud Run Jobs
# Usage: ./deploy-all-crawlers.sh [schedule] [region] [project-id]

set -e

SCHEDULE=${1:-"0 9 * * 1"}
REGION=${2:-"europe-west1"}
PROJECT_ID=${3:-$(gcloud config get-value project)}

echo "🚀 Deploying all crawlers as Cloud Run Jobs"
echo "⏰ Default Schedule: ${SCHEDULE}"
echo "📍 Region: ${REGION}"
echo "🏗️  Project: ${PROJECT_ID}"

# Find all katalozi subcrawler directories
CRAWLERS=$(find crawlers/katalozi/crawlers -maxdepth 1 -type d -not -path crawlers/katalozi/crawlers | sed 's|crawlers/katalozi/crawlers/||')

if [ -z "$CRAWLERS" ]; then
    echo "❌ No subcrawler directories found in ./crawlers/katalozi/crawlers/"
    exit 1
fi

echo "📦 Found crawlers: ${CRAWLERS}"

# Deploy each crawler
for CRAWLER in $CRAWLERS; do
    echo ""
    echo "🔄 Deploying crawler job: ${CRAWLER}"
    ./scripts/deploy-crawler.sh ${CRAWLER} "${SCHEDULE}" ${REGION} ${PROJECT_ID}
done

echo ""
echo "✅ All crawlers deployed successfully!" 