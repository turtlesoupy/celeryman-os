# Cinco Identity Generator 2.5

Celery Man software recreation. Vite + TypeScript, microphone input, generated computer speech and personalized whole-person video. Deployed at https://celeryman.fun on GCP under fun.inc, with creator permission for public deployment. The GitHub repository remains private.

## Run

Node 22+, Python 3 with `numpy`, `scipy`, `opencv-python`, and `ffmpeg`/`ffprobe` are required. Put `OPENAI_API_KEY` and `FAL_KEY` in `.env` (see `.env.example`). Then:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Use the development server: `vite preview` serves static files and does not supply the generation API. `npm run build` checks TypeScript and builds the client.

Choose Paul, Thomas, Ian, Joey, or upload a photograph and enter a name. **Live generation** is the default. Hold **Space** to record and release to send, or press and hold **Record** and release to send. The computer window shows the active microphone and a compact activity line with the suggested phrase beside Ready. Use its **gear** (or **F1**) for microphone selection, Replay mic, detailed activity and other controls. No microphone? Type a command in the computer window's text field and press Enter; it skips transcription and runs the same pipeline. The black terminal displays computer responses. Windows can be dragged, resized, minimized, maximized, restored and closed. **Printout** reopens the latest smiling portrait, with a real Print dialog and Save as PDF support. **Reset** cancels pending display/voice work.

Try the sketch, or novel commands such as “a shoulder shimmy in a mustard yellow tracksuit,” “a tiny backwards shuffle, keeping the tracksuit,” and “a tall purple top hat wobbling twice as slowly.” The NSFW joke uses the warning, fully clothed dancer and malfunction sequence.

## Generation

New commands receive the original recorded “Okay” immediately. A streaming LLM plans the complete outfit and choreography; once those fields arrive, MiniMax H3 Max reference-to-video generates the whole performer directly from the uploaded identity photo. This removes serial image generation and identity-review calls from novel interactive commands. The experiment at `/?fastPath=1` sends every generation request—full-body dancers, portraits, hat wobble, speaking intro, custom commands, and smiling print frames—directly to H3 Max using the original identity photo plus text, without costume-image generation or choreography videos. Portrait prompts explicitly request close-up framing and a pink background. The fast path is on by default; `/?fastPath=0` uses the anchored control, with separate cache keys. Print commands extract the first smiling frame from the fast video. Without the flag, printing retains its still-only image route. The portrait fast path is experimental and has not yet had the full-body path's human evaluation. Video windows stay hidden until their own first decoded frame is available; client diagnostics record `video-visible` separately from provider readiness. Actor-bearing wardrobe references and FLUX Klein were rejected after identity regressions. Moves sharing an outfit reuse the costume frame. Anchored portraits use H3 Max Turbo image-to-video. A light whole-frame filter supplies the soft video texture without segmentation artifacts. A single progressive provider download feeds browser range requests and background caching. Subsequent playback uses saved bytes, including a raw preview copy when postprocessing changes the final clip. Paul’s existing reviewed sketch assets and original generation pipeline remain available for fidelity replay. New videos contain generated music. No heads are pasted onto bodies.

There is no face overlay or head replacement pipeline. Framing, display texture and selected canonical timing corrections operate on complete generated frames. The brief dancer-on-desktop effect removes the studio background from that complete video.

Every uploaded profile gets its own identity and cache namespace. New commands create new media on demand; repeated identical generation requests reuse their result. Paul’s reviewed benchmark assets are cached to permit precise timed replay. The engaged Paul benchmark uses an authorized full-body source pose as its image reference, generates a new H3 video, and aligns a complete generated 35-frame cycle with the original cadence; its provenance records this explicitly. A fresh identity still generates its own assets. Provider latency varies. The final responsiveness benchmark measured fresh novel videos at 5.2–6.4 seconds from typed command to actual playback, with acknowledgment under 4 ms. Through the real microphone/STT path, acknowledgment took 1.63 seconds after release and the new video was available for streaming at 5.37 seconds. A cold canonical Celery Man took 11.3 seconds to actual browser playback. These are measured samples, not latency guarantees or claims of instantaneous video. The loading window reports actual stages.

Microphone commands use the complete MediaRecorder recording with the configured file transcription model by default. Streaming transcription remains an explicit comparison at `/?streamingTranscription=1` (fast generation remains enabled unless `&fastPath=0` is supplied). Clean microphone replay does not guarantee the streaming transcript was correct; client diagnostics record the actual transcript and model. A misheard comma-separated address no longer blocks an otherwise exact load command.

The original scripted computer replies and canonical music use excerpts from the supplied reference. Novel dance commands retain the source computer’s “Okay” acknowledgment. Personalized greetings, attention replies, phone alerts and other unseen speech now use the full cloned MiniMax Speech 2.8 HD voice, streaming 24 kHz PCM into the shared Web Audio bus as it arrives. The user selected HD in all five blind listening comparisons; name splicing and classic TTS remain comparison candidates in the lab only. New full phrases are cached after generation. Generated speech remains an approximation; the experiments and audio grades are retained rather than treating the voice as proven identical. The optional **Reference comparison** mode explicitly plays cropped source dancer clips and is excluded from live-generation evaluations.

API keys stay in the server. Local development stores uploaded photos, generated files and voice caches on this machine. Production persists them in a private Cloud Storage bucket. Generation sends the necessary references to the configured providers. `public/media/generated/*.json` records model/request provenance. Public deployment was explicitly authorized by the user after confirming creator permission.

## Benchmarks

```sh
npm test                         # Reference protocol / window interaction
npm run benchmark:audio          # Full sketch with actual spoken WAV → STT → app
npm run benchmark:timed          # Exact source cue times and cached generated Paul videos
npm run benchmark:generalization # Fresh Thomas upload, real browser mic capture, novel commands
```

The timed benchmark first transcribes the original user utterances through the real STT API, then schedules those transcripts at the original response times. It isolates scene, window and audio timing from provider latency. It must not be interpreted as a cold-generation latency result. The generalization test sends a spoken WAV through Chromium’s fake microphone hardware, `getUserMedia`, MediaRecorder and the real STT API, and uses a fresh profile upload.

Reports, screenshots and recorded output audio are in `benchmarks/`. Visual comparisons use dense chronological contact sheets and an identical-input control. Automated perceptual scores are estimates, not a guarantee of perceptual identity. Generation experiments that failed word accuracy, choreography, or wardrobe checks are not promoted to the runtime.

The local [evaluation page](http://127.0.0.1:5173/benchmarks/review.html) collects the captured sketch playback, fresh-upload videos, checks and limitations. Vite ignores generated media and benchmark outputs so writing new assets does not reload a running session.

### Image and video speed experiments (October 2026)

`benchmarks/quality-speed-20261005.json` records the current comparison and quality decisions. Nano Banana Lite reduced image request latency, but the unchanged prompt framed portraits too widely. A portrait-specific prompt improved framing; one resulting animation invented glasses absent from its starting frame. Turbo without a motion reference also invented different choreography. Neither experiment has replaced production defaults. Smaller motion-reference videos did not reduce total generation latency in this sample.

These scripts make paid provider requests. Supply a local regression photo; it and generated media stay in ignored `analysis/optimization-20261005/`, excluded from deployment. The image comparison also uses the existing Thomas reference. Run in order:

```sh
npx tsx scripts/benchmark-quality-speed.ts /path/to/regression-photo.jpg
npx tsx scripts/benchmark-lite-portraits.ts /path/to/regression-photo.jpg
npx tsx scripts/benchmark-motion-speed.ts /path/to/regression-photo.jpg
npx tsx scripts/benchmark-portrait-animation.ts
npx tsx scripts/benchmark-portrait-models.ts
node scripts/grade-motion-speed.mjs /path/to/regression-photo.jpg
node scripts/build-optimization-gallery.mjs
python3 -m http.server 5174 --bind 127.0.0.1 --directory analysis/optimization-20261005
```

Open http://127.0.0.1:5174 for side-by-side images and playable videos. Timings measure provider request wall time, excluding reference upload and output download. The portrait-model control records HTTP attempts separately to distinguish SDK retries from a single slow provider response. Provider `inference` measures denoising only, not the complete request. Two identities and a few trials cannot establish production percentiles or quality equivalence; automated grades are supporting observations, not release gates by themselves.

For generation quality decisions, use **paired A/B comparisons and the user's ratings**, rather than an output grid or automated scores alone. Keep still-image quality separate from downstream animation defects. The focused review shows the original sketch frame (or motion clip) beside the identity photo, hides model names and timing until revealed, saves ratings locally, and exports a timestamped JSON with a completeness flag. Pair IDs include output content hashes so rerunning generation cannot silently reuse old ratings.

```sh
npx tsx scripts/audit-fal-latency.ts /path/to/regression-photo.jpg
node scripts/build-generation-ab.mjs /path/to/regression-photo.jpg
```

Run the initial image/portrait/motion benchmarks first; then open http://127.0.0.1:5174/ab.html using the local server above. The audit compares raw HTTP, the SDK queue and the production `fal.run` path with matched video inputs, plus Nano Banana 2/Lite portraits with identical prompts. It makes paid requests. The follow-up in `benchmarks/fal-latency-audit-20261005.json` recovered **2–3s** video calls with unchanged settings, so the earlier slow sample does not establish Turbo as slower. Lite portraits still took approximately 3.6–4.7s.

The complete nine-pair human export and model mapping are saved in `benchmarks/generation-ab/human-ratings.json` and `human-summary.json`. All choices were made with model labels hidden. Lite won for Thomas and Nano Banana 2 won for the uploaded photo, in both still and complete-pipeline comparisons. Both Max/Turbo portrait-video comparisons tied; reference-driven Max won for dance choreography. PNG won one format comparison and tied the other. Keep current runtime defaults: the results do not establish Lite as a uniformly quality-preserving replacement. Pipeline comparisons also changed the image prompt; format comparisons used independently generated outputs. Do not infer a universal preference or compression defect from these few samples.

## Responsiveness and audio regression checks

Microphone commands stream 24 kHz PCM to `gpt-live-transcribe` while Space is held (or the Record button is active). Partial text appears as “Hearing”; only the final transcript after release can execute a command. The server issues a 60-second client credential with fixed transcription settings and vocabulary hints. A connection is prepared at Start computer, expires after 45 seconds if unused, and each recording gets its own session, closed after completion or cancellation. The full MediaRecorder capture remains available through Replay mic and automatically supplies the existing file-transcription fallback if streaming fails. Set `STREAMING_TRANSCRIPTION=false` on the server to use the file path. Computer speech still uses original recordings and the selected MiniMax HD clone.

`npx tsx scripts/check-streaming-transcription.ts` checks browser audio capture, partial/final separation, consecutive turns, stale-item rejection, token/socket failures, timeout fallback and reset cancellation, plus 24/44.1/48 kHz resampling. Add `--only-live` for a paid real transcription test, or `--compare` for three streaming and three file-transcription trials with the same synthesized microphone fixture. Set `TEST_ORIGIN` to test a local production build. Results live in `benchmarks/streaming-transcription/`. These use Chromium's simulated microphone with real capture and audio processing; physical phones, headphones and noisy rooms still need listening tests.

The October 5 local production-build comparison recognized “Computer, pause” in all six trials. Median release-to-command-dispatch time was 661 ms with streaming and 1,129 ms with file upload (three trials each); these include the app's 150 ms recording tail and exclude subsequent command interpretation, speech and video generation. See [the comparison data](benchmarks/streaming-transcription/comparison.json). This small sample is not a production latency guarantee.

Music is decoded once and repeated by a Web Audio buffer source on the audio clock. Short crossfades smooth loop boundaries; generated tracks have near-silent outro padding removed. Speech ducks music only during audible playback and releases the duck on completion, interruption, mute, error or reset. Pending voice synthesis does not mute the music. Existing music continues while the next track loads.

Run `npx tsx scripts/benchmark-responsive.ts` for fresh-upload keyboard and actual microphone latency, interrupted speech, and model stage timings. `node scripts/grade-responsiveness.mjs` evaluates the three novel video outputs against the user’s photo and commands. `npx tsx scripts/check-audio-loops.ts`, `npx tsx scripts/check-generated-loop.ts`, and `python3 scripts/verify-loop-audio.py` record actual browser audio and check repeated source/generated loops for silence. Results live in `benchmarks/responsiveness/`. The intentional missing-voice fixture in the audio-controls test verifies recovery from a failed audio request.

Generation progress streams to the browser as Server-Sent Events on the request that started (or joined) the job, so it works across Cloud Run instances; see `deploy/README.md`. `npx tsx scripts/check-generation-stream.ts` checks, without provider calls, a command stream that carries its early-started dance, rejoining a dropped stream by its exact generation body, and the JSON polling fallback used by scripts.

Explicit half-speed and double-speed modifiers control actual video playback rate; the music remains at its own tempo. The renderer retains the same complete generated performer and never composites a head. `npx tsx scripts/check-playback-speed.ts` verifies half-speed playback against elapsed wall-clock time. `node scripts/responsiveness-report.mjs` creates the local review page at `/benchmarks/responsiveness/review.html`.

## Voice listening experiment

Open http://127.0.0.1:5173/voice-lab/index.html for blind, level-matched comparisons, personal ratings/export, AI grader observations, every trial, and live arbitrary-text synthesis. The complete human export selected HD on all five lines, so full HD streaming is now the desktop default for generated speech. Original scripted recordings still play directly.

The comparison covers fitted classic Mac Fred/Junior voices, full MiniMax 2.8 Turbo/HD PCM streaming through the existing clone, and the former F5 name-splicing implementation. Six classic voices were fitted on the Paul greeting only; the selected settings stay frozen for personalized and novel holdouts. This is parameter fitting, not a learned classic-TTS clone. The Mac server needs `say`, ffmpeg, Python, NumPy and SciPy; cloud paths use the existing provider credentials and enrolled voice. No credentials enter the listening page.

- `npm run benchmark:voice:classic`: repeat the six-voice calibration.
- `npm run benchmark:voice`: generate three uncached application trials per synthesis case, isolated cold/warm splice trials, then level-match and run two blinded audio-grader passes. This spends provider credits; cold name synthesis can take over a minute.
- `npm run test:voice-lab`: verify audible browser onset, streaming before completion, cancellation, unsupported splicing, and blind/reveal controls.

Reports are in `benchmarks/voice-lab/` and copied to `public/voice-lab/`. Audio outputs stay in `public/voice-lab/audio/`. `previousTrials` preserves the earlier classic implementation's Python-startup overhead measurements; current local synthesis launches say/ffmpeg directly. Latency reports distinguish first PCM receipt, full file readiness, and browser Web Audio onset (not physical speaker latency). Voice enrollment and original source-word alignment are already warm; cloud-internal cache status is unknown.

The two blind grading passes use the same model with independently ordered anonymous samples, an identical-recording control and a mismatched-voice control. Scores are subjective. Large disagreements are flagged rather than hidden. Splicing cannot synthesize arbitrary sentences. Its “Yes, Thomas!” trial failed because the saved source alignment omitted “Paul”; both failures are retained, and no fallback is mislabeled as splicing. Compare quality per line, since splice averages cover fewer cases.

The complete human evaluation is preserved in `benchmarks/voice-lab/human-ratings.json` with a summary in `human-summary.json`. Human ratings take precedence over the automated voice grader: HD was the favorite on 5/5 lines (mean match 4.4/5, pace 4.8/5), whereas classic voices scored 1/5 on match and splicing scored 1.5/5 on transitions. The automated grader's high splice-continuity scores were not reliable for this listener; they remain recorded unchanged.

Run `npx tsx scripts/check-desktop-voice.ts` to verify the selected voice in the actual desktop: fresh generation, audio before response completion, music ducking only during speech, cancellation/mute, stream failure recovery and original-recording playback. The latest fresh live desktop check began playback in 1.43 s (1.31 s in the preceding run), with no buffer underruns; its capture correlated 0.991 with the generated WAV and included the audible tail. Run `python3 scripts/verify-desktop-voice.py` after the browser check to repeat the capture comparison. Browser onset excludes physical speaker latency.


## Mobile desktop

Phone layouts keep the overlapping window manager at readable size, with touch dragging, resizing and minimize/maximize. Recording controls stay inside the computer window at the bottom, with a touch-sized press-and-hold Record button, Space hint, active microphone and settings gear. Other windows leave room for this input panel. The separate debug and touch toolbars are removed; desktop computer-window geometry remains based on the reference sketch.

`npx tsx scripts/check-input-panel.ts` checks Space recording with button focus, mobile press-and-hold recording, disabled typed commands, microphone selection, persistent errors and responsive bounds. Its screenshots are saved under `output/input-panel/`.

Start opens the selected microphone and keeps it active for the session to avoid Bluetooth startup on each command. Only holding Record or Space records audio for transcription; releasing it stops recording without disabling the input track. Reset and page close release the microphone. AirPods may stay in their microphone audio mode during the session. Speech waits for the output context to resume and buffers 350 ms before starting streamed playback. `npx tsx scripts/check-speech-playback.ts` checks delayed packets, complete PCM sample preservation, short replies, cancellation and delayed output readiness without calling a voice provider.

`npx tsx scripts/check-window-layout.ts` checks window bounds across small phones, landscape, tablets, and reduced keyboard viewports. Browser checks and screenshots are saved under `benchmarks/mobile/`. These are viewport tests, not a claim of physical iPhone/Android microphone or Bluetooth verification. The local development server still binds to loopback. The deployed HTTPS site supports phone access and browser microphone permission.

## Production deployment

See [deployment operations](deploy/README.md) for infrastructure, secrets, persistence, verification and redeploy instructions. `npm start` serves the built desktop and API without Vite; `node --import tsx scripts/check-production.ts` verifies origin protection, static files, media range requests and request limits after `npm run build`.

### Transcribed command routing

Exact sketch commands run locally and always win: `src/protocol.ts` is the blessed script, and any line it recognizes gets the original response. Everything else goes to the director. `src/director.ts` holds its shared, deterministic half: offer/taboo/call state carried in `context.director`, local yes/no answers to its own questions, the fixed taboo reveal templates, and `directorOwnsTurn`, the one rule for when it may speak. `server/director-turn.ts` adds the LLM half through `server/intent-router.ts` (GPT-6 Luna Fast, low reasoning). The router returns sketch cues, `new_character`/`modify_current` (the streaming planner), `dialogue`, `acknowledge`, or a director beat:

- **pitch**: off-topic talk becomes "{preamble}... actually, I have a {TOPIC} sequence I've been working on. Would you like to see it?" with the full plan stored as an offer. Yes reveals it locally (loading bar, pixel title card, intro line); no cancels; "yes, but…" replans. Nothing renders until yes. Later pitches are reworded; the canonical wording returns about one time in five.
- **taboo**: off-limits requests other than the sketch's nude Tayne get "Not computing. Please repeat.", then "This is not suitable for work. Are you sure?", then a fixed, fully clothed reveal behind a pixel mosaic and NSFW window. The user's words never reach the video model; real people and harmful requests are refused.
- **interrupt / call**: a post-sketch taboo reveal arms one call, delivered as the reply to the user's next reaction (no timers). Answering patches through; dismissing triggers chaos with that session's performers and "ERROR: BETA {LABEL}".
- **mode**: "turn on turbo mode" → "TURBO Engaged." with a fixed desktop filter.

While a sketch line is still expected, the director never interrupts or pitches unprompted. Explicit performance requests still get the recorded "Okay." immediately; other turns wait for the server's `intent` event.

`npx tsx scripts/check-director.ts` runs deterministic checks (`--offline`) and then 72 text-only turns against a dev server, saving `benchmarks/director/smoke.json`. `npx tsx scripts/check-director-ui.ts` plays the whole sketch in the browser, then pitch, reveal, mode, the taboo ladder, a call and chaos, with generation blocked; screenshots go to `output/director/`. Both accept `TEST_ORIGIN`. `npx tsx scripts/check-command-dialogue.ts` checks pitch acceptance and modification. These make billable text-only API calls.
