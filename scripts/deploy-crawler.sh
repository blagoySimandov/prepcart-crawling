#!/bin/bash

# Deploy crawler as a scheduled Cloud Run Job
# Usage: ./deploy-crawler.sh <crawler-name> [schedule] [region] [project-id]

set -e

# Check if crawler name is provided
if [ -z "$1" ]; then
    echo "Usage: ./deploy-crawler.sh <crawler-name> [schedule] [region] [project-id]"
    echo "Example: ./deploy-crawler.sh bila-bulgaria \"0 9 * * 1\""
    echo ""
    echo "Common schedules (in UTC):"
    echo "  \"0 9 * * 1\"     - Weekly Monday 9 AM"
    echo "  \"0 6 * * *\"     - Daily 6 AM"
    echo "  \"0 */6 * * *\"   - Every 6 hours"
    echo "  \"0 9 * * 1,3,5\" - Mon, Wed, Fri 9 AM"
    exit 1
fi

CRAWLER_NAME=$1
SCHEDULE=${2:-"0 9 * * 1"}
REGION=${3:-"europe-west1"}
PROJECT_ID=${4:-$(gcloud config get-value project)}
JOB_NAME="prepcart-job-${CRAWLER_NAME}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${JOB_NAME}"
SCHEDULER_NAME="prepcart-schedule-${CRAWLER_NAME}"

echo "🚀 Deploying crawler job: ${CRAWLER_NAME}"
echo "📍 Region: ${REGION}"
echo "🏗️  Project: ${PROJECT_ID}"
echo "🐳 Image: ${IMAGE_NAME}"
echo "⏰ Schedule: ${SCHEDULE}"

# Check if crawler directory exists
if [ ! -d "crawlers/${CRAWLER_NAME}" ]; then
    echo "❌ Error: Crawler directory 'crawlers/${CRAWLER_NAME}' does not exist"
    exit 1
fi

# Build and push Docker image
echo "🔨 Building Docker image..."
docker build --build-arg CRAWLER_NAME=${CRAWLER_NAME} -t ${IMAGE_NAME} .

echo "📤 Pushing image to Google Container Registry..."
docker push ${IMAGE_NAME}

# Check if the job already exists
if gcloud run jobs describe ${JOB_NAME} --region=${REGION} &> /dev/null; then
  # Update existing Cloud Run Job
  echo "☁️  Updating existing Cloud Run Job: ${JOB_NAME}..."
  gcloud run jobs update ${JOB_NAME} \
    --region=${REGION} \
    --image=${IMAGE_NAME} \
    --tasks=1 \
    --parallelism=1 \
    --max-retries=0 \
    --task-timeout=3600 \
    --cpu=1 \
    --memory=1Gi \
    --set-env-vars="CRAWLER_NAME=${CRAWLER_NAME}" \
    --quiet
else
  # Create new Cloud Run Job
  echo "☁️  Creating new Cloud Run Job: ${JOB_NAME}..."
  gcloud run jobs create ${JOB_NAME} \
    --region=${REGION} \
    --image=${IMAGE_NAME} \
    --tasks=1 \
    --parallelism=1 \
    --max-retries=0 \
    --task-timeout=3600 \
    --cpu=1 \
    --memory=1Gi \
    --set-env-vars="CRAWLER_NAME=${CRAWLER_NAME}" \
    --quiet
fi

echo "⏰ Setting up Cloud Scheduler..."
# Create or update Cloud Scheduler job
gcloud scheduler jobs create http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="${SCHEDULE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
    --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
    --time-zone="UTC" \
    --quiet 2>/dev/null || \
gcloud scheduler jobs update http ${SCHEDULER_NAME} \
    --location=${REGION} \
    --schedule="${SCHEDULE}" \
    --uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method=POST \
    --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
    --oauth-token-scope="https://www.googleapis.com/auth/cloud-platform" \
    --time-zone="UTC" \
    --quiet

echo "✅ Job deployment completed!"
echo "🔧 Job Name: ${JOB_NAME}"
echo "⏰ Scheduler: ${SCHEDULER_NAME} (${SCHEDULE})"
echo "🎯 To trigger manually: make trigger CRAWLER=${CRAWLER_NAME}" 