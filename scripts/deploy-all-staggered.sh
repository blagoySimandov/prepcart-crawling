#!/bin/bash

# Deploy all crawlers with staggered schedules
# Usage: ./deploy-all-staggered.sh [start-hour] [interval-minutes] [region] [project-id]

set -e

START_HOUR=${1:-9}
INTERVAL_MINUTES=${2:-30}
REGION=${3:-"europe-west1"}
PROJECT_ID=${4:-$(gcloud config get-value project)}

echo "🚀 Deploying all crawlers as Cloud Run Jobs with staggered schedules"
echo "⏰ Start time: ${START_HOUR}:00 UTC"
echo "⏳ Interval: ${INTERVAL_MINUTES} minutes"
echo "📍 Region: ${REGION}"
echo "🏗️  Project: ${PROJECT_ID}"

# Find all katalozi subcrawler directories
CRAWLERS=$(find crawlers/katalozi/crawlers -maxdepth 1 -type d -not -path crawlers/katalozi/crawlers | sed 's|crawlers/katalozi/crawlers/||' | sort)

if [ -z "$CRAWLERS" ]; then
    echo "❌ No subcrawler directories found in ./crawlers/katalozi/crawlers/"
    exit 1
fi

CRAWLER_ARRAY=($CRAWLERS)
echo "📦 Found ${#CRAWLER_ARRAY[@]} crawlers: ${CRAWLER_ARRAY[*]}"

# Calculate schedules for each crawler
current_hour=$START_HOUR
current_minute=0

for i in "${!CRAWLER_ARRAY[@]}"; do
    CRAWLER=${CRAWLER_ARRAY[$i]}
    
    # Create cron schedule
    SCHEDULE="$current_minute $current_hour * * *"
    
    echo ""
    echo "🔄 Deploying crawler job: ${CRAWLER} ($(($i + 1))/${#CRAWLER_ARRAY[@]})"
    echo "⏰ Schedule: ${SCHEDULE} (${current_hour}:$(printf "%02d" $current_minute) UTC daily)"
    
    # Deploy the crawler
    ./scripts/deploy-crawler.sh ${CRAWLER} "${SCHEDULE}" ${REGION} ${PROJECT_ID}
    
    # Calculate next time slot
    current_minute=$((current_minute + INTERVAL_MINUTES))
    
    # Handle hour overflow
    if [ $current_minute -ge 60 ]; then
        current_hour=$((current_hour + current_minute / 60))
        current_minute=$((current_minute % 60))
        
        # Handle 24-hour overflow (wrap to next day)
        if [ $current_hour -ge 24 ]; then
            current_hour=$((current_hour % 24))
        fi
    fi
done

echo ""
echo "✅ All crawlers deployed successfully with staggered schedules!"
echo ""
echo "📋 Deployment Summary:"
echo "================================"

# Reset counters to show summary
current_hour=$START_HOUR
current_minute=0

for i in "${!CRAWLER_ARRAY[@]}"; do
    CRAWLER=${CRAWLER_ARRAY[$i]}
    printf "  %-20s → %02d:%02d UTC daily\n" "$CRAWLER" "$current_hour" "$current_minute"
    
    # Calculate next time slot (same logic as above)
    current_minute=$((current_minute + INTERVAL_MINUTES))
    if [ $current_minute -ge 60 ]; then
        current_hour=$((current_hour + current_minute / 60))
        current_minute=$((current_minute % 60))
        if [ $current_hour -ge 24 ]; then
            current_hour=$((current_hour % 24))
        fi
    fi
done

echo ""
echo "🎯 To check status: make list-deployed"
echo "🔧 To trigger manually: make trigger CRAWLER=<crawler-name>"