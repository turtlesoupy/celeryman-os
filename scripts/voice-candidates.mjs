import 'dotenv/config';import fs from 'node:fs/promises';import {fal} from '@fal-ai/client';
fal.config({credentials:process.env.FAL_KEY});
const audio=await fal.storage.upload(new File([await fs.readFile('analysis/voice-long.wav')],'computer.wav',{type:'audio/wav'}));
const result=await fal.subscribe('fal-ai/minimax/voice-clone',{input:{audio_url:audio,text:'Good morning Thomas. What will your first sequence of the day be?',noise_reduction:true,need_volume_normalization:true,model:'speech-02-hd'}});
await fs.writeFile('analysis/minimax-voice.json',JSON.stringify(result,null,2));
if(result.data.audio)await fs.writeFile('analysis/minimax-voice.mp3',Buffer.from(await(await fetch(result.data.audio.url)).arrayBuffer()));
console.log('voice clone complete');
