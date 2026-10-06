#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
project=celeryman-os
region=us-central1
image="$region-docker.pkg.dev/$project/celeryman/app:$(git rev-parse --short HEAD)"
gcloud builds submit --project="$project" --region="$region" --config=deploy/cloudbuild.yaml --substitutions="_IMAGE=$image" .
gcloud run deploy celeryman --project="$project" --region="$region" --image="$image" \
 --service-account="celeryman-runtime@$project.iam.gserviceaccount.com" \
 --no-invoker-iam-check --execution-environment=gen2 --cpu=2 --memory=4Gi \
 --min=1 --max=10 --concurrency=40 --timeout=300 --no-cpu-throttling \
 --set-env-vars='APP_ORIGINS=https://celeryman.fun,GOOGLE_CLOUD_PROJECT=celeryman-os' \
 --set-secrets='OPENAI_API_KEY=openai-api-key:latest,FAL_KEY=fal-key:latest,COMPUTER_VOICE_ID=computer-voice-id:latest,ORIGIN_TOKEN=origin-token:latest,TURNSTILE_SECRET=turnstile-secret:latest' \
 --add-volume='name=media,type=cloud-storage,bucket=celeryman-os-media,mount-options=uid=1000;gid=1000;enable-streaming-writes=false' \
 --add-volume-mount='volume=media,mount-path=/data'
