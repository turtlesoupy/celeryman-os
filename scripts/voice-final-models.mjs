import 'dotenv/config';import fs from 'node:fs/promises';import {fal} from '@fal-ai/client';import {execFileSync} from 'node:child_process';
fal.config({credentials:process.env.FAL_KEY});
const audio=await fal.storage.upload(new File([await fs.readFile('public/media/original/greeting.wav')],'computer.wav',{type:'audio/wav'}));
const outcomes=await Promise.allSettled(['F5-TTS','E2-TTS'].map(async model=>{const r=await fal.subscribe('fal-ai/f5-tts',{input:{gen_text:'Good morning Thomas. What will your first sequence of the day be?',ref_audio_url:audio,ref_text:'Good morning Paul. What will your first sequence of the day be?',model_type:model,remove_silence:true}});const raw=`analysis/${model}.raw.wav`;await fs.writeFile(raw,Buffer.from(await(await fetch(r.data.audio_url.url)).arrayBuffer()));execFileSync('ffmpeg',['-y','-i',raw,'-ar','24000','-c:a','pcm_s16le',`analysis/${model}.wav`,'-loglevel','error']);console.log(model,r.requestId);}));

for(const outcome of outcomes)if(outcome.status==='rejected')console.error(outcome.reason?.body||outcome.reason?.message||outcome.reason);
