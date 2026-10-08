import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fal} from '@fal-ai/client';

// Re-run to retrieve the saved request; never silently submit a duplicate.
const dir = path.resolve('output/thomas-intro-20261006');
const jobPath = path.join(dir, 'happy-horse-job.json');
const source = path.join(dir, 'original-intro.mp4');
const mode = process.argv[2] || 'submit';
fal.config({credentials: process.env.FAL_KEY});
await fs.mkdir(dir, {recursive: true});
const exists = async p => fs.access(p).then(() => true, () => false);

if (mode === 'submit') {
  if (await exists(jobPath)) throw new Error('A saved request exists. Use status or collect.');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', 'reference/celery-man.mp4',
    '-t', '11.011', '-c:v', 'libx264', '-crf', '17', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', source]);
  const upload = async (file, type) => fal.storage.upload(new File([await fs.readFile(file)], path.basename(file), {type}));
  const [video, photo] = await Promise.all([upload(source, 'video/mp4'), upload('reference/thomas-dimson.jpg', 'image/jpeg')]);
  const model = 'alibaba/happy-horse/video-edit';
  const input = {
    video_url: video,
    reference_image_urls: [photo],
    prompt: 'Perform a precise identity replacement throughout this entire multi-shot video. Replace the original man\'s head and face with the same adult man shown in @Image1: his recognizable facial proportions, shaggy brown hair, short brown beard and moustache, and round dark eyeglasses. Keep his glasses consistently present in every view. Adapt his head naturally to the exact original head pose, perspective, lighting, motion blur, and facial expression in every frame, including wide shots, side profiles, closeups and rear views. Preserve the original blue button-down shirt, tie, pale trousers, shoes, body performance, walking, sitting and reaching movements. Preserve the original surreal blue environment, narrow white walkway, desk, monitors, chair, mug, keyboard, all camera movements, exact shot transitions and timing, framing, composition and original audio. Only change the person\'s facial identity, hair, facial hair and glasses. The final keyboard closeup must remain unchanged. No new shots, no retiming, no added text, no extra people, no changes to clothing or set. This is a playful comedy face-swap edit.',
    resolution: '1080p', audio_setting: 'origin', seed: 61006,
  };
  const request = await fal.queue.submit(model, {input});
  await fs.writeFile(jobPath, JSON.stringify({model, input, request, source, interval: [0, 11.011], createdAt: new Date().toISOString()}, null, 2));
  console.log(JSON.stringify({requestId: request.request_id, jobPath}));
} else {
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'));
  const status = await fal.queue.status(job.model, {requestId: job.request.request_id, logs: true});
  console.log(JSON.stringify(status));
  if (mode === 'collect' && status.status === 'COMPLETED') {
    const result = await fal.queue.result(job.model, {requestId: job.request.request_id});
    await fs.writeFile(path.join(dir, 'happy-horse-result.json'), JSON.stringify(result, null, 2));
    const response = await fetch(result.data.video.url);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const output = path.join(dir, 'thomas-intro-happy-horse-raw.mp4');
    await fs.writeFile(output, Buffer.from(await response.arrayBuffer()));
    console.log(output);
  }
}
