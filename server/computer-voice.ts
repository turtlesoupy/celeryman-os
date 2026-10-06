import 'dotenv/config';
import fs from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {fal} from '@fal-ai/client';
import {collectPcm} from './pcm-stream.ts';
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
type VoiceProgress={stage:string;elapsedMs:number;requestId?:string|null;status?:number;bytes?:number;lastChunkMs?:number;error?:string;errorName?:string;abortedBy?:string};
type VoiceOptions={onProgress?:(progress:VoiceProgress)=>void};
export async function clonedStream(text:string,tier:'turbo'|'hd',onChunk:(chunk:Buffer)=>void,signal?:AbortSignal,options:VoiceOptions={}){
 fal.config({credentials:process.env.FAL_KEY});
 const setupAt=performance.now();options.onProgress?.({stage:'preparing-voice',elapsedMs:0});
 const voiceId=await computerVoiceId();
 const voiceSetupMs=performance.now()-setupAt;
 const start=performance.now();options.onProgress?.({stage:'requesting-audio',elapsedMs:voiceSetupMs});
 // The SDK's timeout does not cover binary PCM reads. Bound the whole request.
 const deadline=AbortSignal.timeout(30000);
 const requestSignal=AbortSignal.any([deadline,...(signal?[signal]:[])]);
 let requestId:string|null=null,bytes=0,lastChunkMs:number|undefined,stage='waiting-for-headers';
 try{
 requestSignal.throwIfAborted();
 // Read native PCM directly. The SDK iterator throttles each chunk and its
 // binary event reader also leaves aborted reads as unhandled rejections.
 const response=await fetch(`https://fal.run/fal-ai/minimax/speech-2.8-${tier}/stream`,{
  method:'POST',headers:{Authorization:`Key ${process.env.FAL_KEY}`,'Content-Type':'application/json',Accept:'application/octet-stream'},
  body:JSON.stringify({prompt:text,voice_setting:{voice_id:voiceId,speed:1,emotion:'neutral'},audio_setting:{format:'pcm',sample_rate:24000,channel:1},language_boost:'English'}),signal:requestSignal
 });
 requestId=response.headers.get('x-fal-request-id');stage='waiting-for-audio';
 const headersMs=performance.now()-start;options.onProgress?.({stage:'provider-headers',elapsedMs:performance.now()-setupAt,requestId,status:response.status});
 if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.message||error.detail||`Voice provider returned HTTP ${response.status}`);}
 if(/json|text\//i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw Error('Unexpected non-PCM streaming response');}
 if(!response.body)throw Error('Missing voice stream');
 let firstChunkMs:number|undefined;
 const result=await collectPcm(response.body,chunk=>{if(firstChunkMs===undefined){firstChunkMs=performance.now()-start;options.onProgress?.({stage:'first-audio',elapsedMs:performance.now()-setupAt,requestId});}stage='reading-audio';bytes+=chunk.length;lastChunkMs=performance.now()-setupAt;onChunk(chunk);},requestSignal);
 return {pcm:result.pcm,voiceSetupMs,headersMs,firstChunkMs,completeMs:performance.now()-start,requestId:response.headers.get('x-fal-request-id')};
 }catch(error){
  options.onProgress?.({stage,elapsedMs:performance.now()-setupAt,requestId,bytes,lastChunkMs,error:String(error),errorName:(error as Error).name,abortedBy:signal?.aborted?'caller':deadline.aborted?'deadline':undefined});
  throw error;
 }
}

// Human listening comparison selected the full HD clone, without name splicing or extra EQ.
export async function streamComputerVoice(text:string,onChunk:(chunk:Buffer)=>void,signal?:AbortSignal,options:VoiceOptions={}){
 const id=createHash('sha256').update('human-selected-hd-pcm-v1:'+text).digest('hex').slice(0,20);
 const file=`public/media/voice/${id}.wav`,url=`/media/voice/${id}.wav`;
 const start=performance.now();
 let cached:Buffer|undefined;try{cached=await fs.readFile(file);}catch{}
 if(cached){if(signal?.aborted)throw new DOMException('Cancelled','AbortError');onChunk(cached.subarray(44));return {url,cached:true,firstChunkMs:performance.now()-start,completeMs:performance.now()-start};}
 let firstChunkMs:number|undefined;
 const result=await clonedStream(text,'hd',chunk=>{firstChunkMs??=performance.now()-start;onChunk(chunk);},signal,options);
 await fs.mkdir('public/media/voice',{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,pcmWav(result.pcm));await fs.rename(temp,file);
 return {url,cached:false,voiceSetupMs:result.voiceSetupMs,headersMs:result.headersMs,firstChunkMs,completeMs:performance.now()-start,requestId:result.requestId};
}
