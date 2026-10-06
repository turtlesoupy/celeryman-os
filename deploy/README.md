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

The production Node server serves the Vite build and existing API. Development-only tools, the voice lab, source tree and original reference movie are not web routes. Media supports byte ranges for video/audio. Cloudflare proxies requests and streams speech without buffering or caching, provides HTTPS and adds an origin token. Direct Cloud Run traffic is rejected without that token, except for `/healthz`. Browser API origins are restricted to the site. API writes must be POST; only job status and health accept GET. The edge supplies the client address for basic per-instance request limits (30 per API endpoint per minute, five photo uploads per minute). These counters live in each instance's memory, so with several instances the effective limit multiplies; durable per-IP limits belong at the Cloudflare edge. Each instance runs at most 100 fresh generations at once, and a generation that has not settled after 180 seconds is failed. Cached jobs still load immediately.

Cloud Run autoscales from one warm instance (2 vCPU / 4 GiB, always-allocated CPU; **this has an ongoing idle compute cost**) up to ten. Instances share no in-memory state:

- A generation runs on the instance that received its request, and its progress streams back over that same request as Server-Sent Events (`POST /api/generate`, or `POST /api/command` for the dance a command starts early). No other instance needs to know about it.
- A disconnect stops the stream, not the paid render; the result is still persisted. A reconnecting browser re-posts the exact generation body, which hashes to the same job ID: it joins the job if it reaches the same instance and otherwise reuses saved media (or, rarely, renders again).
- Live previews carry the provider's output URL sealed with AES-GCM (keyed from `ORIGIN_TOKEN`, or `MEDIA_TOKEN_SECRET` if set), so any instance can stream a preview it did not generate. Only `*.fal.media` URLs are accepted.
- Finished media, uploads and caches are shared through the bucket.

`GET /api/job/:id` remains for scripts against a single server; it only sees jobs on the instance that answers. A restart during generation can require repeating that command; completed media and uploaded photos persist across restarts.

Cloud Storage FUSE mounts at `/data`. `public/media/generated`, `public/media/profiles`, `public/media/voice` and `cache` are symlinked into it. Streaming writes are disabled because ffmpeg needs seekable output files. Preset Paul/Thomas assets are seeded from local caches; friend test-profile uploads are excluded. New uploads and generated media are stored by the running app. The bucket is private (public access prevention enforced, no public IAM). The application serves only playable media under `/media/`: original sketch clips, generated videos, posters and prints, and voice audio. Provenance JSON, identity costume frames, uploaded photos and motion references are never served, even to someone who knows an ID, and there is no listing route.

## Turnstile

Cloudflare Turnstile widget `celeryman` (invisible, domain `celeryman.fun`, site key `0x4AAAAAAFPpVQfNKWt2ZKaS`) gates paid work. The browser mints one token while the identity launcher is open and exchanges it at `POST /api/session` for a signed two-hour session (HMAC keyed from `ORIGIN_TOKEN`, so any instance accepts it). Command, generation, upload, transcription and voice routes require the `X-Cinco-Session` header; an expired or invalid session returns 401 and the client renews once. Health, diagnostics, job status and warm-up stay open. Production refuses to start without `TURNSTILE_SECRET`. Local development is ungated unless `TURNSTILE_SECRET` and `VITE_TURNSTILE_SITE_KEY` are set (Cloudflare's test keys work). `npx tsx scripts/check-turnstile.ts` checks the gate and the real widget with test keys.

## Secrets

Secret Manager contains `openai-api-key`, `fal-key`, `computer-voice-id`, `origin-token` and `turnstile-secret`. Only the runtime service account receives `roles/secretmanager.secretAccessor` on those individual secrets. Its storage grant is limited to `roles/storage.objectUser` on the media bucket. Cloudflare's Worker has the same origin token as a secret binding.

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

## Edge caching

The Worker explicitly caches the public HTML shell for 30 seconds at the edge (`max-age=0, s-maxage=30`), retaining the full query string in its cache key. Hashed `/assets/` bundles cache for a year; fonts have shorter browser/edge TTLs. Cookies, authorization, cross-origin requests and ranges bypass shared cache lookup. APIs, streamed speech, uploaded/generated media, errors and responses setting cookies remain uncached. Cached HTML still loads and executes the browser app normally; identity/session state and API requests are not embedded into the shell. If personalized data is ever rendered into HTML, return `private, no-store` for that response.

Startup archives hashed bundles in `/data/cache/static-assets`; the origin can serve older bundles to cached HTML and already-open tabs after deployment. Keep that archive when rolling revisions. `X-Cinco-Cache` reports HIT, MISS or BYPASS. Run `node scripts/check-edge-cache.mjs` to verify policy.


### Fast-path video model

`FAST_VIDEO_MODEL=reference` (default) uses `minimax/h3-max/reference-to-video`.
`FAST_VIDEO_MODEL=turbo` uses `minimax/h3-max-turbo/image-to-video` directly with the original identity photo.
This server-only flag applies to all fast-path variants and custom characters. The legacy non-fast pipeline is unchanged.
Turbo has its own generation cache keys; switching back reuses existing reference-model assets.
Turbo can show the source photo for the first few frames and had weaker identity preservation in the initial ratings. Its output canvas follows the identity photo rather than the requested portrait/full-body aspect ratio. No automatic trimming or cropping is applied.

After deploying code containing this flag, switch production without rebuilding:

```sh
gcloud run services update celeryman --project=celeryman-os --region=us-central1 --update-env-vars=FAST_VIDEO_MODEL=turbo
# Restore the default model:
gcloud run services update celeryman --project=celeryman-os --region=us-central1 --update-env-vars=FAST_VIDEO_MODEL=reference
```

These commands create a new Cloud Run revision. Normal deployments preserve this setting (`--update-env-vars`).
Locally, set the variable in `.env` and restart the server.
