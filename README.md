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

The original scripted computer replies and canonical music use excerpts from the supplied reference. Novel dance commands retain the source computer’s “Okay” acknowledgment. Personalized greetings, attention replies and phone alerts use the source phrase around an F5-generated, word-aligned name. Other unseen speech uses a cloned MiniMax Speech 2.8 HD voice. Generated name pronunciation and unseen speech are approximations; the experiments and audio grades are retained rather than treating the voice as proven identical. The optional **Reference comparison** mode explicitly plays cropped source dancer clips and is excluded from live-generation evaluations.

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
