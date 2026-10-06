import 'dotenv/config';
import fs from 'node:fs/promises';
import {fal} from '@fal-ai/client';
import {computerVoiceId} from '../server/computer-voice.ts';
const out='benchmarks/startup-voice-20261005/transport.json';
const voiceId=await computerVoiceId(),trials:any[]=[];
for(const tier of ['hd','turbo','hd','turbo'] as const){
 const started=performance.now();let firstEventMs:number|undefined,eventChunks=0,eventBytes=0,firstIteratorMs:number|undefined,iteratorChunks=0;
 let network:any={};const nativeFetch=globalThis.fetch;
 fal.config({credentials:process.env.FAL_KEY,fetch:async(input:any,init:any)=>{const response=await nativeFetch(input,init);network={headersMs:performance.now()-started,status:response.status};return response;}});
 const stream=await fal.stream(`fal-ai/minimax/speech-2.8-${tier}`,{input:{prompt:'Good morning Ian.\nWhat will your first sequence of the day be?',voice_setting:{voice_id:voiceId,speed:1,emotion:'neutral'},audio_setting:{format:'pcm',sample_rate:24000 as unknown as '24000',channel:1 as unknown as '1'},language_boost:'English'},signal:AbortSignal.timeout(40000),timeout:30000});
 stream.on('data',(chunk:any)=>{if(chunk instanceof Uint8Array){firstEventMs??=performance.now()-started;eventChunks++;eventBytes+=chunk.length;}});
 const done=stream.done().then(()=>performance.now()-started);void done.catch(()=>{});
 for await(const chunk of stream){firstIteratorMs??=performance.now()-started;iteratorChunks++;}
 const iteratorCompleteMs=performance.now()-started,wireCompleteMs=await done;
 const trial={tier,firstEventMs,firstIteratorMs,wireCompleteMs,iteratorCompleteMs,addedByIteratorMs:iteratorCompleteMs-wireCompleteMs,eventChunks,eventBytes,iteratorChunks,network,requestId:stream.requestId};
 trials.push(trial);await fs.writeFile(out,JSON.stringify({created:new Date().toISOString(),notes:['Each trial observes the same provider request through the SDK data events and through its async iterator.','Both use the existing enrolled voice ID; application phrase cache bypassed.'],trials},null,2)+'\n');console.log(JSON.stringify(trial));
}
