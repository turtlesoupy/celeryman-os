# celeryman.fun deployment

- GitHub: private `turtlesoupy/celeryman-os`, branch `main`.
- GCP project: `celeryman-os` (number `717961985321`), organization `fun.inc` (`664032688987`).
- Region: `us-central1`; Cloud Run service: `celeryman`.
- Artifact Registry: `us-central1-docker.pkg.dev/celeryman-os/celeryman/app`.
- Runtime identity: `celeryman-runtime@celeryman-os.iam.gserviceaccount.com`.
- Build identity: `celeryman-builder@celeryman-os.iam.gserviceaccount.com`, with source/build-log bucket access, Artifact Registry write and log-write access; no provider secrets.
- Storage: `gs://celeryman-os-media`, public access prevented, uniform IAM, default seven-day soft deletion.
- Cloudflare Worker: `celeryman-os`; custom domains `celeryman.fun` and `www.celeryman.fun` (redirects to apex).

The user confirmed permission for public deployment. There is no access-code requirement on the public site. The application has no password gate.

## Runtime

The production Node server serves the Vite build and existing API. Development-only tools, the voice lab, source tree and original reference movie are not web routes. Media supports byte ranges for video/audio. Cloudflare proxies requests and streams speech without buffering or caching, provides HTTPS and adds an origin token. Direct Cloud Run traffic is rejected without that token, except for `/healthz`. Browser API origins are restricted to the site. The edge supplies the client address for basic request limits (30 per API endpoint per minute, five photo uploads per minute). At most four fresh video generations run simultaneously. Cached jobs still load immediately.

One warm Cloud Run instance with 2 vCPU / 4 GiB and always-allocated CPU keeps the current background job model running between polling requests. **This has an ongoing idle compute cost.** Maximum instances is one: before scaling beyond that, move job coordination out of the in-memory map. A restart during generation can require repeating that command; completed media and uploaded photos persist across restarts. The client already reports failed/unknown jobs rather than waiting indefinitely.

Cloud Storage FUSE mounts at `/data`. `public/media/generated`, `public/media/profiles`, `public/media/voice` and `cache` are symlinked into it. Streaming writes are disabled because ffmpeg needs seekable output files. Preset Paul/Thomas assets are seeded from local caches; friend test-profile uploads are excluded. New uploads and generated media are stored by the running app. The bucket is private; media is served by the application through opaque profile/job IDs, with no listing route.

## Secrets

Secret Manager contains `openai-api-key`, `fal-key`, `computer-voice-id`, and `origin-token`. Only the runtime service account receives `roles/secretmanager.secretAccessor` on those individual secrets. Its storage grant is limited to `roles/storage.objectUser` on the media bucket. Cloudflare's Worker has the same origin token as a secret binding.

Local Cloudflare credentials and the origin token are in the ignored `.env`, never in the repository, build context, image or frontend bundle. Cloudflare credentials are used only by the deployment script and are not supplied to Cloud Run. `.gcloudignore` and `.dockerignore` also exclude local generated media, profiles, benchmarks, and reference video. The voice clone enrollment ID is preserved so production uses the chosen computer voice.

## Redeploy

With the authenticated `thomas@fun.inc` gcloud account and provider secrets already provisioned:

```sh
npm ci
npm run build
node --import tsx scripts/check-production.ts
bash scripts/deploy-gcp.sh
node scripts/deploy-cloudflare.mjs
```

The GCP script builds remotely, tags with the current Git commit and deploys. The Cloudflare script obtains the Cloud Run URL, uploads the edge proxy, binds the apex/`www` domains, and disables `workers.dev` previews. Both scripts specify their own project without changing the developer's gcloud default project.

After rotating `origin-token`, update `.env`, deploy a new Cloud Run revision and run the Cloudflare script using the same new value. Provider key rotations require a new Cloud Run revision to load the latest secret versions. Do not place secret values in shell command arguments or print them in logs; feed secret versions through stdin or a protected file.

## Checks and rollback

`scripts/check-production.ts` exercises origin isolation, allowed browser origin, public desktop, fonts, media byte ranges, path traversal rejection, scripted commands and rate limiting. Live deployment checks are recorded in `benchmarks/deployment/verification.json`.

```sh
gcloud run revisions list --project=celeryman-os --region=us-central1 --service=celeryman
gcloud run services update-traffic celeryman --project=celeryman-os --region=us-central1 --to-revisions=REVISION=100
gcloud run services logs read celeryman --project=celeryman-os --region=us-central1 --limit=50
```

Rollback changes the application image, not stored media. Do not delete the media bucket when rolling back. No public write permission is granted to that bucket.
