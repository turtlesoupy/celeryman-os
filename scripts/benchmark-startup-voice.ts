import 'dotenv/config';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {clonedStream,pcmWav,computerVoiceId} from '../server/computer-voice.ts';

const directory=process.env.VOICE_BENCHMARK_DIR||'benchmarks/startup-voice-20261005';
await fs.mkdir(directory,{recursive:true});
const report:any={created:new Date().toISOString(),notes:[
 'Sequential requests; HD and Turbo are interleaved to reduce time-order bias.',
 'Direct trials bypass the application phrase cache and reuse the same enrolled voice ID. Provider-internal caching is unknown.',
 'First PCM and first voiced PCM are arrival timings, not acoustic speaker onset.',
 'HTTP trials use the actual local production API handler with fresh greeting text; cache state is recorded.',
 'No production voice-model settings are changed.'
],trials:[]};
let network:any[]=[],trialStart=0;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(input:any,init:any)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
 const entry:any={host:url.host,path:url.pathname,startMs:performance.now()-trialStart};network.push(entry);
 try{const response=await nativeFetch(input,init);entry.headersMs=performance.now()-trialStart;entry.status=response.status;return response;}
 catch(error){entry.failedMs=performance.now()-trialStart;entry.error=String(error);throw error;}
};
const enrollmentAt=performance.now();await computerVoiceId();report.savedVoiceReadyMs=performance.now()-enrollmentAt;
const persist=()=>fs.writeFile(directory+'/report.json',JSON.stringify(report,null,2)+'\n');
function monitor(){let chunks=0,bytes=0,firstPcmMs:number|undefined,firstVoicedPcmMs:number|undefined,carry=Buffer.alloc(0);
 return {chunk(pcm:Buffer){chunks++;bytes+=pcm.length;firstPcmMs??=performance.now()-trialStart;if(firstVoicedPcmMs===undefined){carry=Buffer.concat([carry,pcm]);let offset=0;for(;offset+480<=carry.length;offset+=480){let energy=0;for(let i=offset;i<offset+480;i+=2){const value=carry.readInt16LE(i)/32768;energy+=value*value;}if(Math.sqrt(energy/240)>.002){firstVoicedPcmMs=performance.now()-trialStart;break;}}carry=carry.subarray(offset);}},result:()=>({chunks,bytes,firstPcmMs,firstVoicedPcmMs})};
}
// Exact reported greeting, plus several new names, against both model tiers.
const names=['Ian','Mara','Felix','Nora','Jules','Ada','Rowan','Clara'].slice(0,Number(process.env.VOICE_TRIALS)||8);
for(const [index,name] of names.entries())for(const tier of index%2?['turbo','hd'] as const:['hd','turbo'] as const){
 const text=`Good morning ${name}.\nWhat will your first sequence of the day be?`;
 trialStart=performance.now();network=[];const measurement=monitor();const trial:any={path:'direct',tier,name,text};
 try{const result=await clonedStream(text,tier,measurement.chunk,AbortSignal.timeout(40000));Object.assign(trial,measurement.result(),{completeMs:performance.now()-trialStart,providerFirstChunkMs:result.firstChunkMs,providerCompleteMs:result.completeMs,requestId:result.requestId,audioSeconds:result.pcm.length/48000});
  if(index===0){trial.audio=`${directory}/ian-${tier}.wav`;await fs.writeFile(trial.audio,pcmWav(result.pcm));}
 }catch(error){Object.assign(trial,measurement.result(),{completeMs:performance.now()-trialStart,error:String(error)});}
 trial.network=network;report.trials.push(trial);await persist();console.log(JSON.stringify(trial));
}
for(const name of (process.env.VOICE_HTTP_NAMES?.split(',')||['Priya','Elias','Mina','Owen','Tessa','Luca'])){
 const text=`Good morning ${name}.\nWhat will your first sequence of the day be?`;
 const id=createHash('sha256').update('human-selected-hd-pcm-v1:'+text).digest('hex').slice(0,20);
 let cacheExisted=false;try{await fs.access(`public/media/voice/${id}.wav`);cacheExisted=true;}catch{}
 if(cacheExisted){console.log(JSON.stringify({skipped:name,reason:'Already cached'}));continue;}
 trialStart=performance.now();const measurement=monitor();const trial:any={path:'http',tier:'hd',name,text,cacheExisted};
 try{const response=await fetch('http://127.0.0.1:5173/api/voice/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text}),signal:AbortSignal.timeout(40000)});trial.headersMs=performance.now()-trialStart;trial.status=response.status;
  if(!response.ok)throw Error(`HTTP ${response.status}`);let pending='';const decoder=new TextDecoder();
  for await(const chunk of response.body!){pending+=decoder.decode(chunk,{stream:true});let at;while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(!line)continue;const event=JSON.parse(line);if(event.type==='pcm')measurement.chunk(Buffer.from(event.data,'base64'));if(event.type==='error')throw Error(event.error);if(event.type==='done')trial.server=event;}}
  if(!trial.server)throw Error('No completion event');Object.assign(trial,measurement.result(),{completeMs:performance.now()-trialStart});
 }catch(error){Object.assign(trial,measurement.result(),{completeMs:performance.now()-trialStart,error:String(error)});}
 report.trials.push(trial);await persist();console.log(JSON.stringify(trial));
}
function summarize(trials:any[]){const metric=(key:string)=>{const values=trials.map(t=>t[key]).filter(Number.isFinite).sort((a,b)=>a-b);return {min:values[0],median:values.length%2?values[Math.floor(values.length/2)]:(values[values.length/2-1]+values[values.length/2])/2,max:values.at(-1)};};return {count:trials.length,errors:trials.filter(t=>t.error).length,firstPcmMs:metric('firstPcmMs'),firstVoicedPcmMs:metric('firstVoicedPcmMs'),completeMs:metric('completeMs'),over10Seconds:trials.filter(t=>t.firstPcmMs>10000||t.completeMs>10000).length};}
report.summary=Object.fromEntries(['direct-hd','direct-turbo','http-hd'].map(group=>[group,summarize(report.trials.filter((t:any)=>`${t.path}-${t.tier}`===group))]));await persist();console.log(JSON.stringify({summary:report.summary}));
