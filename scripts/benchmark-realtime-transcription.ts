import 'dotenv/config';
import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import OpenAI from 'openai';
import {scripted,sketch,type Context} from '../src/protocol.ts';
const exec=promisify(execFile),client=new OpenAI({maxRetries:0,timeout:20000});
const results:any[]=[];
for(const index of [1,2,9,10,11,12,13,16]){
 const {stdout:pcm}=await exec('ffmpeg',['-v','error','-i',`benchmarks/voice-inputs/${String(index).padStart(2,'0')}.wav`,'-f','s16le','-ar','24000','-ac','1','pipe:1'],{encoding:'buffer',maxBuffer:4e6});
 const session:any=await client.realtime.clientSecrets.create({session:{type:'transcription',audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:'gpt-live-transcribe',languages:['en'],keywords:['Celery Man','Cinco','Tayne','Oyster','4d3d3d3','hat wobble','flarhgunnstow'],delay:'low'},turn_detection:null}}}});
 const ws=new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription',['realtime','openai-insecure-api-key.'+session.value]);
 let began=0,committed=0,firstDeltaMs:number|undefined;
 const complete=new Promise<any>((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Realtime transcription timed out')),20000);
  ws.addEventListener('message',event=>{
   const data=JSON.parse(String(event.data));
   if(data.type==='conversation.item.input_audio_transcription.delta'&&data.delta)firstDeltaMs??=performance.now()-began;
   if(data.type==='error'){clearTimeout(timer);reject(Error(data.error?.message||'Realtime error'));}
   if(data.type==='conversation.item.input_audio_transcription.completed'){clearTimeout(timer);resolve({text:data.transcript,afterReleaseMs:performance.now()-committed,firstDeltaMs,durationMs:pcm.length/48});}
  });
  ws.addEventListener('error',()=>{clearTimeout(timer);reject(Error('WebSocket failed'));});
 });
 void complete.catch(()=>{});
 try{
  await new Promise<void>((resolve,reject)=>{ws.addEventListener('open',()=>resolve(),{once:true});ws.addEventListener('error',()=>reject(Error('WebSocket failed')),{once:true});});
  began=performance.now();
  for(let offset=0;offset<pcm.length;offset+=4800){
   ws.send(JSON.stringify({type:'input_audio_buffer.append',audio:pcm.subarray(offset,offset+4800).toString('base64')}));
   await new Promise(r=>setTimeout(r,Math.min(100,(pcm.length-offset)/48)));
  }
  committed=performance.now();ws.send(JSON.stringify({type:'input_audio_buffer.commit'}));
  const result=await complete;
  const context:Context={identity:'Paul',character:'tayne',pending:index===12?'repeat':index===13?'nsfw':'',history:[]};
  const action=scripted(result.text,context)?.action||'llm-fallback';
  const row={index,...result,action,expectedAction:sketch[index].action,actionCorrect:action===sketch[index].action};results.push(row);console.log(JSON.stringify(row));
 }finally{ws.close();}
}
await fs.mkdir('benchmarks/latency',{recursive:true});
await fs.writeFile('benchmarks/latency/realtime-transcription.json',JSON.stringify({created:new Date().toISOString(),model:'gpt-live-transcribe',delay:'low',note:'Real sketch clips paced in 100ms PCM chunks; new session per clip; connection setup excluded, not a physical microphone test',results},null,2)+'\n');
