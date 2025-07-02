#!/bin/bash

# Trigger a Cloud Run Job manually
# Usage: ./trigger-job.sh <crawler-name> [region] [project-id]

set -e

if [ -z "$1" ]; then
    echo "Usage: ./trigger-job.sh <crawler-name> [region] [project-id]"
    echo "Example: ./trigger-job.sh bila-bulgaria"
    exit 1
fi

CRAWLER_NAME=$1
REGION=${2:-"europe-west1"}
PROJECT_ID=${3:-$(gcloud config get-value project)}
JOB_NAME="prepcart-job-${CRAWLER_NAME}"

echo "🚀 Triggering job: ${JOB_NAME}"

gcloud run jobs execute ${JOB_NAME} \
    --region=${REGION} \
    --wait

echo "✅ Job execution completed!"
echo "🔍 View logs: gcloud run jobs logs tail ${JOB_NAME} --region=${REGION}" 