import 'dotenv/config';import fs from 'node:fs/promises';import {fal} from '@fal-ai/client';
fal.config({credentials:process.env.FAL_KEY});
const reference_text="Good morning Paul. What will your first sequence of the day be? I have a beta sequence I've been working on. Would you like to see it?";
const audio_url=await fal.storage.upload(new File([await fs.readFile('public/media/original/voice-reference.wav')],'computer.wav',{type:'audio/wav'}));
const clone=await fal.subscribe('fal-ai/qwen-3-tts/clone-voice/1.7b',{input:{audio_url,reference_text}});
await fs.writeFile('analysis/qwen-clone.json',JSON.stringify(clone,null,2));
for(const[name,text]of [['paul','Good morning Paul. What will your first sequence of the day be?'],['thomas','Good morning Thomas. What will your first sequence of the day be?']]){
 const result=await fal.subscribe('fal-ai/qwen-3-tts/text-to-speech/1.7b',{input:{text,language:'English',speaker_voice_embedding_file_url:clone.data.speaker_embedding.url,reference_text,temperature:.3,max_new_tokens:600}});
 await fs.writeFile(`analysis/qwen-${name}.wav`,Buffer.from(await(await fetch(result.data.audio.url)).arrayBuffer()));
 console.log('complete',name);
}
