# Cinco Identity Generator 2.5

https://github.com/user-attachments/assets/debd5697-6ab1-48c5-a088-6bac223182b6

A working recreation of the Celery Man sketch's desktop software. Pick an identity (or add yourself), then talk to the computer: the sketch's lines play the original responses, and anything else generates a new dancer who looks like you, in an outfit and routine planned from your request.

Live at **https://celeryman.fun**.

## Using it

- **Choose an identity.** **Add yourself** takes a photo (upload or camera) and a name, and starts right away. Presets: Paul Rudd, Barack Obama, Donald Trump, Dario Amodei, Sam Altman, Thomas, Ian and Joey.
- **Give commands.** Hold **Space** (or press and hold **Record**), speak, and release to send. No microphone? Type in the computer window's text field and press Enter.
- **Follow the sketch** ("Computer, load up Celery Man, please") for the original responses, or go off script: "a shoulder shimmy in a mustard yellow tracksuit", "a tall purple top hat wobbling twice as slowly", "load up potato man".
- **Controls.** The gear (or **F1**) opens microphone selection, Replay mic and activity details. **Printout** reopens the latest smiling portrait with a real print dialog. **Reset** cancels pending work. Windows drag, resize, minimize and maximize, including on phones.

## Requirements

- Node 22+
- Python 3 with `numpy`, `scipy` and `opencv-python` (video finishing for canonical dances)
- `ffmpeg` and `ffprobe`
- API keys in `.env` (see `.env.example`): `OPENAI_API_KEY` for command planning, routing and transcription; `FAL_KEY` for video, image and voice generation
- macOS `say` only for the voice lab's classic-voice comparisons

## Running locally

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Use the dev server: `vite preview` serves static files only and has no generation API. `npm run build` type-checks and builds the client; `npm start` serves the build and API without Vite.

URL flags:

| Flag | Effect |
|---|---|
| `?fastPath=0` | Use the anchored generation pipeline (costume frame, then video) instead of the default direct path |
| `?streamingTranscription=1` | Stream microphone audio to realtime transcription instead of uploading the finished recording |

## How it works

### Commands

1. **Input.** Speech is recorded with MediaRecorder and transcribed after release (`gpt-4o-mini-transcribe` by default, `TRANSCRIPTION_MODEL` to change). Typed commands skip transcription.
2. **Sketch first.** `src/protocol.ts` is the script. Any line it recognizes runs locally with the original recorded response.
3. **Director.** Everything else goes to `server/director-turn.ts`, which asks the intent router (`server/intent-router.ts`, GPT-6 Luna) to classify the turn:
   - **sketch cue**: a paraphrased or misheard sketch line, played as the original
   - **new or modified performer**: handed to the streaming planner
   - **pitch**: off-topic talk becomes the computer offering a themed sequence it has "been working on"; yes reveals it
   - **taboo**: off-limits requests get the sketch's "Not computing" ladder and a fixed, fully clothed reveal; the user's words never reach the video model
   - **mode**: "turn on turbo mode" applies a desktop filter
   - **call**: after a taboo reveal, a phone call interrupts the next reaction
   - **dialogue** or **acknowledge**: short in-character replies

   `src/director.ts` holds the deterministic half: offer, taboo and call state, local answers to its own yes/no questions, and the rule for when the director may speak.
4. **Planning.** A streaming LLM writes the outfit and choreography. Video generation starts as soon as those two fields arrive, while the label and response finish. Performance requests get the recorded "Okay." immediately.

### Video

The default path sends the identity photo plus the planned outfit and motion straight to MiniMax H3 Max reference-to-video (`FAST_VIDEO_MODEL=turbo` switches to H3 Max Turbo image-to-video). The anchored path (`?fastPath=0`) first renders a costume frame with Nano Banana 2, then animates it; canonical dances can follow a choreography reference video and are retimed and finished in `server/choreography.ts`.

The whole performer is always generated together: there is no face overlay or head pasting. Results are cached by generation request, so repeating a request replays saved media. Each identity has its own cache namespace, and preset photo revisions keep a replaced photo's media from being reused. Progress streams to the browser as Server-Sent Events from the request that started or joined the job, so it works across Cloud Run instances. `public/media/generated/*.json` records each video's model and request provenance.

### Speech and music

Scripted replies and canonical music are excerpts from the original sketch. Other computer speech (greetings, pitches, calls) uses a MiniMax Speech 2.8 HD clone of the computer's voice, streamed as 24 kHz PCM into a shared Web Audio bus and cached per phrase. Music loops on the audio clock with short crossfades, and ducks only while speech is audible.

The microphone opens once at Start and stays open for the session (avoiding Bluetooth startup on every command); only holding Record or Space captures audio.

## Project layout

| Path | Contents |
|---|---|
| `src/` | Desktop client: window manager (`main.ts`, `window-layout.ts`), identity launcher, sketch script (`protocol.ts`), director state, audio, transcription and generation streams |
| `server/` | API (`api.ts`), intent router, director, planners, video and voice generation, job streaming, Turnstile session gate, production server |
| `reference/` | Preset identity photos (credits in `reference/CREDITS.md`) and the original sketch |
| `public/media/` | Original clips, motion references, and generated media and voice caches (ignored) |
| `scripts/` | Browser checks, benchmarks, asset and icon generation, deploy scripts |
| `benchmarks/` | Saved reports, ratings and screenshots from checks and experiments |
| `deploy/` | Cloud Build, Cloudflare worker and operations notes |

## Deployment

Production runs on Cloud Run behind a Cloudflare proxy, with a Turnstile session gating paid API routes and generated media persisted in Cloud Storage. See [deploy/README.md](deploy/README.md) for infrastructure, secrets and redeploy steps. After `npm run build`, `node --import tsx scripts/check-production.ts` verifies origin protection, static files, media range requests and rate limits.

## Tests and benchmarks

Most browser checks run against the dev server, mock the providers, and save screenshots under `output/` or `benchmarks/`. Scripts marked *paid* call real providers.

| Command | Checks |
|---|---|
| `npm test` | Sketch protocol and window interaction |
| `npx tsx scripts/check-identity-launcher.ts` | Identity chooser, Add yourself, camera, responsive launcher |
| `npx tsx scripts/check-window-layout.ts` | Window bounds on phones, tablets and keyboard-sized viewports |
| `npx tsx scripts/check-input-panel.ts` | Recording controls, microphone selection, typed commands |
| `npx tsx scripts/check-generation-stream.ts` | Generation SSE streams, rejoining and polling fallback |
| `npx tsx scripts/check-speech-playback.ts` | Streamed speech buffering, cancellation and output readiness |
| `npx tsx scripts/check-director.ts` | Director state offline, then text-only turns (*paid*) |
| `npx tsx scripts/check-director-ui.ts` | Full sketch, pitch, taboo ladder, call and chaos in the browser (*paid*, text only) |
| `node --import tsx scripts/check-uploaded-identity.ts <photo or preset id>` | Fresh celery, portrait, oyster and Tayne generations for visual review (*paid*) |

Benchmarks:

```sh
npm run benchmark:audio          # Full sketch: spoken WAV → STT → app
npm run benchmark:timed          # Original cue timing with cached Paul videos
npm run benchmark:generalization # Fresh upload, fake-mic capture, novel commands (paid)
npm run benchmark:voice          # Voice lab trials and blind grading (paid)
npx tsx scripts/benchmark-responsive.ts  # Keyboard and microphone latency for fresh uploads (paid)
```

The timed benchmark schedules real transcripts at the original response times, so it measures scene and audio timing, not generation latency. Fake-microphone tests exercise real capture and audio processing in Chromium; they don't replace listening tests on physical phones and headsets.

Review pages on the dev server:

- http://127.0.0.1:5173/benchmarks/review.html: sketch playback, fresh-upload videos and checks
- http://127.0.0.1:5173/voice-lab/index.html: blind, level-matched voice comparisons with ratings export

For generation quality decisions, prefer blind paired A/B comparisons with human ratings over output grids or automated scores; `scripts/build-generation-ab.mjs` builds one. Automated grades are supporting observations, not release gates.
