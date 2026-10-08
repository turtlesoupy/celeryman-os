import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const name = process.argv[2] || 'happy-horse';
if (!['happy-horse', 'pixverse'].includes(name)) throw new Error('Expected happy-horse or pixverse');
const dir = path.resolve('output/thomas-intro-20261006');
const raw = path.join(dir, `thomas-intro-${name}-raw.mp4`);
const out = path.join(dir, `thomas-intro-${name}-final.mp4`);
const probe = p => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', p], {encoding: 'utf8'}));
const inputProbe = probe(raw);
const inputVideo = inputProbe.streams.find(s => s.codec_type === 'video');
if (Math.abs(Number(inputVideo.duration) - 11.011) > 0.2) throw new Error('Provider changed duration; review timing before export');
// Frame 291 starts the keyboard closeup; frame 330 starts the next scene.
// Restore the original keyboard shot and original audio to remove generated artifacts.
const width = name === 'happy-horse' ? 1920 : 1280;
const height = name === 'happy-horse' ? 1080 : 720;
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-i', 'reference/celery-man.mp4',
  '-filter_complex', `[0:v]fps=30000/1001,scale=${width}:${height}:flags=lanczos,setsar=1,trim=end_frame=291,setpts=PTS-STARTPTS[a];[1:v]fps=30000/1001,scale=${width}:${height}:flags=lanczos,setsar=1,trim=start_frame=291:end_frame=330,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]`,
  '-map', '[v]', '-map', '1:a:0', '-t', '11.011', '-c:v', 'libx264', '-preset', 'slow', '-crf', '17',
  '-pix_fmt', 'yuv420p', '-c:a', 'copy', '-movflags', '+faststart',
  '-metadata', 'title=Thomas Dimson — Celery Man intro',
  '-metadata', `comment=AI identity swap using FAL ${name}; original keyboard shot and audio.`, out]);
const finalProbe = probe(out);
execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', out, '-f', 'null', '-']);
await fs.writeFile(path.join(dir, `${name}-export-check.json`), JSON.stringify({inputProbe, finalProbe, originalInterval: [0, 11.011], originalKeyboardFrames: [291, 330], originalAudio: true, decodeCheck: 'passed'}, null, 2));
console.log(out);
