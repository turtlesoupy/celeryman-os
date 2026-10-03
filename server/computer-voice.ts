import 'dotenv/config';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fal} from '@fal-ai/client';
let enrollment:Promise<string>|undefined;
export function computerVoiceId(){
 if(process.env.COMPUTER_VOICE_ID)return Promise.resolve(process.env.COMPUTER_VOICE_ID);
 enrollment??=(async()=>{
  fal.config({credentials:process.env.FAL_KEY});
  const file='cache/minimax-computer-voice.json';
  try{return JSON.parse(await fs.readFile(file,'utf8')).voiceId as string;}catch{}
  const audio=await fal.storage.upload(new File([await fs.readFile('public/media/original/voice-long.wav')],'computer.wav',{type:'audio/wav'}));
  const clone:any=await fal.subscribe('fal-ai/minimax/voice-clone',{input:{audio_url:audio,noise_reduction:true,need_volume_normalization:true,text:'Sequence engaged.',model:'speech-02-hd'}});
  await fs.mkdir('cache',{recursive:true});await fs.writeFile(file,JSON.stringify({voiceId:clone.data.custom_voice_id}));return clone.data.custom_voice_id as string;
 })();enrollment.catch(()=>{enrollment=undefined;});return enrollment;
}
export function pcmWav(pcm:Buffer){const h=Buffer.alloc(44);h.write('RIFF');h.writeUInt32LE(36+pcm.length,4);h.write('WAVEfmt ',8);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);return Buffer.concat([h,pcm]);}
export async function clonedStream(text:string,tier:'turbo'|'hd',onChunk:(chunk:Buffer)=>void,signal?:AbortSignal){
 fal.config({credentials:process.env.FAL_KEY});
 const voiceId=await computerVoiceId();
 const start=performance.now(),chunks:Buffer[]=[];let firstChunkMs:number|undefined;
 // fal's generated SDK declares these numeric enums as strings; the live API requires numbers.
 const stream=await fal.stream(`fal-ai/minimax/speech-2.8-${tier}`,{input:{prompt:text,voice_setting:{voice_id:voiceId,speed:1,emotion:'neutral'},audio_setting:{format:'pcm',sample_rate:24000 as unknown as '24000',channel:1 as unknown as '1'},language_boost:'English'},signal,timeout:30000});
 const done=stream.done();void done.catch(()=>{});
 for await(const event of stream){if(!(event instanceof Uint8Array))throw Error('Unexpected non-PCM streaming response');const chunk=Buffer.from(event);if(!chunk.length)continue;firstChunkMs??=performance.now()-start;chunks.push(chunk);onChunk(chunk);}
 await done;const pcm=Buffer.concat(chunks);if(!pcm.length||pcm.length%2)throw Error('Incomplete PCM audio');
 return {pcm,firstChunkMs,completeMs:performance.now()-start,requestId:stream.requestId};
}

// Human listening comparison selected the full HD clone, without name splicing or extra EQ.
export async function streamComputerVoice(text:string,onChunk:(chunk:Buffer)=>void,signal?:AbortSignal){
 const id=createHash('sha256').update('human-selected-hd-pcm-v1:'+text).digest('hex').slice(0,20);
 const file=`public/media/voice/${id}.wav`,url=`/media/voice/${id}.wav`;
 const start=performance.now();
 let cached:Buffer|undefined;try{cached=await fs.readFile(file);}catch{}
 if(cached){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');onChunk(cached.subarray(44));return {url,cached:true,firstChunkMs:performance.now()-start,completeMs:performance.now()-start};}
 const result=await clonedStream(text,'hd',onChunk,signal);
 await fs.mkdir('public/media/voice',{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,pcmWav(result.pcm));await fs.rename(temp,file);
 return {url,cached:false,firstChunkMs:result.firstChunkMs,completeMs:performance.now()-start};
}
