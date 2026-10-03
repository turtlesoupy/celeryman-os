import 'dotenv/config';import fs from 'node:fs/promises';import {fal} from '@fal-ai/client';import {execFileSync} from 'node:child_process';
fal.config({credentials:process.env.FAL_KEY});
const audio=await fal.storage.upload(new File([await fs.readFile('public/media/original/beta.wav')],'speaker.wav',{type:'audio/wav'}));
const frame=await fal.storage.upload(new File([await fs.readFile('public/media/generated/d6ff076568741cd0d5bb.png')],'portrait.png',{type:'image/png'}));
const outcomes=await Promise.allSettled([['thomas','Good morning Thomas. What will your first sequence of the day be?'],['novel','Mustard shimmy engaged.']].map(async([name,line])=>{
 const r=await fal.subscribe('minimax/h3-max/reference-to-video',{input:{reference_image_urls:[frame],reference_audio_urls:[audio],prompt:`The man in Image 1 speaks directly to the camera. His exact dialogue is "${line}". His VOICE is the same electronic robotic synthesized male voice from Audio 1, with the same unusual formant resonance and pitch and deadpan delivery. Synchronized lips. No music. Only the supplied dialogue is audible; he is silent before and after speaking.`,duration:5,resolution:'480P',aspect_ratio:'4:3',prompt_expansion_mode:'disabled'}});
 const file=`analysis/h3-dialogue-${name}.mp4`;await fs.writeFile(file,Buffer.from(await(await fetch(r.data.video.url)).arrayBuffer()));execFileSync('ffmpeg',['-y','-i',file,'-vn','-ar','24000','-c:a','pcm_s16le',file.replace('.mp4','.wav'),'-loglevel','error']);console.log(name,r.requestId);
}));

for(const outcome of outcomes)if(outcome.status==='rejected')console.error(outcome.reason?.body||outcome.reason?.message||outcome.reason);
