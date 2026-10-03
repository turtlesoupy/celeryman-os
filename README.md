# Cinco Identity Generator 2.5

Private Celery Man software recreation. Vite + TypeScript, a local API, microphone input, generated computer speech and personalized whole-person video. No public deployment is configured.

## Run

Node 22+, Python 3 with `numpy`, `scipy`, `opencv-python`, and `ffmpeg`/`ffprobe` are required. Put `OPENAI_API_KEY` and `FAL_KEY` in `.env` (see `.env.example`). Then:

```sh
npm install
npm run dev
```

Open http://127.0.0.1:5173. Use the development server: `vite preview` serves static files and does not supply the generation API. `npm run build` checks TypeScript and builds the client.

Choose Paul, Thomas, or upload a photograph and enter a name. **Live generation** is the default. Hold **Space** to speak, or use **F1** for the command field and controls. Click the black terminal to type directly. Windows can be dragged, resized, minimized, maximized, restored and closed. **Printout** opens the latest virtual printer page. **Reset** cancels pending display/voice work.

Try the sketch, or novel commands such as “a shoulder shimmy in a mustard yellow tracksuit,” “a tiny backwards shuffle, keeping the tracksuit,” and “a tall purple top hat wobbling twice as slowly.” The NSFW joke uses the warning, fully clothed dancer and malfunction sequence.

## Generation

New commands receive the original recorded “Okay” immediately. A streaming LLM plans the complete outfit and choreography; once those fields arrive, MiniMax H3 Max reference-to-video generates the whole performer directly from the uploaded identity photo. This removes serial image generation and identity-review calls from interactive commands. Fresh friends’ canonical moves use a fast FLUX.2 klein 9B costume frame guided by the supplied wardrobe image, then H3 with the original motion reference. A light whole-frame filter supplies the soft video texture without segmentation artifacts. Completed provider video streams immediately while local caching runs in the background. Paul’s existing reviewed sketch assets and original generation pipeline remain available for fidelity replay. New videos contain generated music. No heads are pasted onto bodies.

There is no face overlay or head replacement pipeline. Framing, display texture and selected canonical timing corrections operate on complete generated frames. The brief dancer-on-desktop effect removes the studio background from that complete video.

Every uploaded profile gets its own identity and cache namespace. New commands create new media on demand; repeated identical generation requests reuse their result. Paul’s reviewed benchmark assets are cached to permit precise timed replay. The engaged Paul benchmark uses an authorized full-body source pose as its image reference, generates a new H3 video, and aligns a complete generated 35-frame cycle with the original cadence; its provenance records this explicitly. A fresh identity still generates its own assets. Provider latency varies. The final responsiveness benchmark measured fresh novel videos at 5.2–6.4 seconds from typed command to actual playback, with acknowledgment under 4 ms. Through the real microphone/STT path, acknowledgment took 1.63 seconds after release and the new video was available for streaming at 5.37 seconds. A cold canonical Celery Man took 11.3 seconds to actual browser playback. These are measured samples, not latency guarantees or claims of instantaneous video. The loading window reports actual stages.

The original scripted computer replies and canonical music use excerpts from the supplied reference. Novel dance commands retain the source computer’s “Okay” acknowledgment. Personalized greetings, attention replies, phone alerts and other unseen speech now use the full cloned MiniMax Speech 2.8 HD voice, streaming 24 kHz PCM into the shared Web Audio bus as it arrives. The user selected HD in all five blind listening comparisons; name splicing and classic TTS remain comparison candidates in the lab only. New full phrases are cached after generation. Generated speech remains an approximation; the experiments and audio grades are retained rather than treating the voice as proven identical. The optional **Reference comparison** mode explicitly plays cropped source dancer clips and is excluded from live-generation evaluations.

API keys stay in the server. Uploaded photos, generated files and voice caches remain on this machine, while generation requests send the necessary references to the configured providers. `public/media/generated/*.json` records model/request provenance. This workspace remains for personal use under the permission supplied with the task.

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

## Responsiveness and audio regression checks

Music is decoded once and repeated by a Web Audio buffer source on the audio clock. Short crossfades smooth loop boundaries; generated tracks have near-silent outro padding removed. Speech ducks music only during audible playback and releases the duck on completion, interruption, mute, error or reset. Pending voice synthesis does not mute the music. Existing music continues while the next track loads.

Run `npx tsx scripts/benchmark-responsive.ts` for fresh-upload keyboard and actual microphone latency, interrupted speech, pause/resume, and model stage timings. `node scripts/grade-responsiveness.mjs` evaluates the three novel video outputs against the user’s photo and commands. `npx tsx scripts/check-audio-loops.ts`, `npx tsx scripts/check-generated-loop.ts`, and `python3 scripts/verify-loop-audio.py` record actual browser audio and check repeated source/generated loops for silence. Results live in `benchmarks/responsiveness/`. The intentional missing-voice fixture in the audio-controls test verifies recovery from a failed audio request.

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

Phone layouts keep the overlapping window manager at readable size. Windows are recomposed for portrait or landscape, with touch dragging, resizing, minimize/maximize, and a Windows switcher for bringing covered windows forward. The bottom bar provides Talk (tap again to send), Type, Windows, and More. Sign-in and command controls use touch-sized targets; desktop geometry remains based on the reference sketch.

`npx tsx scripts/check-window-layout.ts` checks window bounds across small phones, landscape, tablets, and reduced keyboard viewports. Browser checks and screenshots are saved under `benchmarks/mobile/`. These are viewport tests, not a claim of physical iPhone/Android microphone or Bluetooth verification. The local development server still binds to loopback; phone access requires a separately configured private HTTPS connection.
