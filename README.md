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

The server renders a complete person in costume with Nano Banana 2, checks visible identity features (including glasses), retries substantial mismatches, then generates actual MP4 video with MiniMax H3 or Kling motion control. The reference sketch supplies choreography/style guidance for canonical moves. New commands go through an LLM to produce a full outfit and concrete choreography, then through image-to-video generation. The generated videos include music for novel dances.

There is no face overlay or head replacement pipeline. Framing, display texture and selected canonical timing corrections operate on complete generated frames. The brief dancer-on-desktop effect removes the studio background from that complete video.

Every uploaded profile gets its own identity and cache namespace. New commands create new media on demand; repeated identical requests reuse their result. Paul’s reviewed benchmark assets are cached to permit precise timed replay. The engaged Paul benchmark uses an authorized full-body source pose as its image reference, generates a new H3 video, and aligns a complete generated 35-frame cycle with the original cadence; its provenance records this explicitly. A fresh identity still generates its own assets. Provider latency varies: the fast H3 paths have generally taken seconds; Kling choreography has taken a few minutes. The loading window reports actual stages rather than pretending generation is instantaneous.

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
