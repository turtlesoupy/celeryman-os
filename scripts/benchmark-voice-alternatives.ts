import 'dotenv/config';
import fs from 'node:fs/promises';
import {fal} from '@fal-ai/client';
const dir='benchmarks/startup-voice-20261005';await fs.mkdir(dir,{recursive:true});
const report:any={created:new Date().toISOString(),notes:['Small sequential sample; no application phrase cache. Hosted endpoints return a finished audio file, so these are full-file readiness timings, not streaming first-byte timings.','Reference upload and Qwen enrollment are measured separately and excluded from synthesis trials.','All samples retained without quality-based selection.'],trials:[]};
const persist=()=>fs.writeFile(dir+'/alternatives.json',JSON.stringify(report,null,2)+'\n');
async function run(model:string,input:unknown){const start=performance.now();const response=await fetch('https://fal.run/'+model,{method:'POST',headers:{Authorization:'Key '+process.env.FAL_KEY,'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(60000)});const data:any=await response.json();if(!response.ok)throw Error(JSON.stringify({status:response.status,detail:data.detail||data.message||data.error}));return {data,readyMs:performance.now()-start,requestId:response.headers.get('x-fal-request-id')};}
fal.config({credentials:process.env.FAL_KEY});const uploadAt=performance.now();const reference=await fal.storage.upload(new File([await fs.readFile('public/media/original/voice-reference.wav')],'computer.wav',{type:'audio/wav'}));report.referenceUploadMs=performance.now()-uploadAt;
const referenceText="Good morning Paul. What will your first sequence of the day be? I have a beta sequence I've been working on. Would you like to see it?";
let embedding:string|undefined;
try{const clone=await run('fal-ai/qwen-3-tts/clone-voice/0.6b',{audio_url:reference,reference_text:referenceText});embedding=clone.data.speaker_embedding.url;report.qwenEnrollment={readyMs:clone.readyMs,requestId:clone.requestId};}catch(error){report.qwenEnrollment={error:String(error)};}await persist();console.log(JSON.stringify({setup:{referenceUploadMs:report.referenceUploadMs,qwenEnrollment:report.qwenEnrollment}}));
for(const name of ['Ian','Mara','Felix'])for(const model of ['chatterbox-turbo',...(embedding?['qwen-0.6b']:[])]){
 const text=`Good morning ${name}. What will your first sequence of the day be?`,trial:any={model,name,text};const started=performance.now();
 try{const endpoint=model==='chatterbox-turbo'?'fal-ai/chatterbox/text-to-speech/turbo':'fal-ai/qwen-3-tts/text-to-speech/0.6b';
  const input=model==='chatterbox-turbo'?{text,audio_url:reference}:{text,language:'English',speaker_voice_embedding_file_url:embedding,reference_text:referenceText,max_new_tokens:600};
  const result=await run(endpoint,input);Object.assign(trial,{readyMs:result.readyMs,requestId:result.requestId});const url=result.data.audio.url||result.data.audio;const downloaded=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!downloaded.ok)throw Error('Audio download failed');const bytes=Buffer.from(await downloaded.arrayBuffer());trial.downloadedMs=performance.now()-started;trial.audioSeconds=result.data.audio.duration;trial.file=dir+'/'+name.toLowerCase()+'-'+model+(bytes.subarray(0,4).toString()==='RIFF'?'.wav':'.mp3');await fs.writeFile(trial.file,bytes);
 }catch(error){Object.assign(trial,{error:String(error),elapsedMs:performance.now()-started});}
 report.trials.push(trial);await persist();console.log(JSON.stringify(trial));
}
