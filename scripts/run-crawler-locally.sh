#!/bin/bash

# Run crawler locally with Docker using Application Default Credentials
# Usage: ./run-crawler-locally.sh <crawler-name>

set -e

if [ -z "$1" ]; then
    echo "Usage: ./run-crawler-locally.sh <crawler-name>"
    echo "Example: ./run-crawler-locally.sh bila-bulgaria"
    echo ""
    echo "Note: Make sure you're authenticated with Google Cloud:"
    echo "  gcloud auth application-default login"
    exit 1
fi

CRAWLER_NAME=$1
IMAGE_NAME="prepcart-crawler-${CRAWLER_NAME}"

echo "🐳 Building Docker image for crawler: ${CRAWLER_NAME}"
docker build --build-arg CRAWLER_NAME=${CRAWLER_NAME} -t ${IMAGE_NAME} .

# Check if user is authenticated with gcloud
if ! gcloud auth application-default print-access-token &>/dev/null; then
    echo "❌ Error: Not authenticated with Google Cloud"
    echo "Please run: gcloud auth application-default login"
    exit 1
fi

echo "🔑 Using Application Default Credentials"
echo "📍 Mounting Google Cloud credentials from host"

# Mount the ADC credentials from the host
ADC_PATH="$HOME/.config/gcloud/application_default_credentials.json"
if [ -f "$ADC_PATH" ]; then
    docker run \
        -v "$ADC_PATH:/root/.config/gcloud/application_default_credentials.json:ro" \
        -e GOOGLE_APPLICATION_CREDENTIALS=/root/.config/gcloud/application_default_credentials.json \
        -e CRAWLER_NAME=${CRAWLER_NAME} \
        ${IMAGE_NAME}
else
    echo "❌ Application Default Credentials not found at: $ADC_PATH"
    echo "Please run: gcloud auth application-default login"
    exit 1
fi 