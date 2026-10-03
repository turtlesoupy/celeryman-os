import 'dotenv/config';
import fs from 'node:fs/promises';
import OpenAI, {toFile} from 'openai';
import {scripted, sketch, type Context} from '../src/protocol.ts';

// Rotate model order, use identical real sketch recordings, and grade actual
// command routing as well as latency. Never feed the expected line as a prompt.
const client = new OpenAI({maxRetries:0, timeout:20000});
const models = (process.env.TRANSCRIPTION_BENCH_MODELS || 'gpt-4o-transcribe,gpt-4o-mini-transcribe,gpt-transcribe').split(',');
const manifest:number[][] = JSON.parse(await fs.readFile('benchmarks/voice-inputs/manifest.json','utf8'));
const prompt = 'Vocabulary: Celery Man, Cinco, Tayne, Oyster, 4d3d3d3 (four dee three dee three dee three), hat wobble, flarhgunnstow.';
const rows:any[]=[];
const unavailable = new Set<string>();
const repeats = Number(process.env.TRANSCRIPTION_BENCH_REPEATS || 2);
const quantile=(values:number[],q:number)=>[...values].sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
const normalize=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
for(let round=0;round<repeats;round++){
 for(const [index] of manifest){
  const clip=String(index).padStart(2,'0');
  const audio=await fs.readFile(`benchmarks/voice-inputs/${clip}.wav`);
  const context:Context={identity:'Paul',character:index>=7?'tayne':index>=4?'oyster':'celery',pending:index===7?'beta':index===12?'repeat':index===13?'nsfw':'',history:[]};
  for(let offset=0;offset<models.length;offset++){
   const model=models[(offset+index+round)%models.length];if(unavailable.has(model))continue;
   const started=performance.now();
   try{
    const file=await toFile(audio,'clip.wav',{type:'audio/wav'});
    const newer=model==='gpt-transcribe';
    const args:any={file,model,prompt,...(newer?{languages:['en']}:{language:'en',response_format:'json',include:['logprobs']})};
    const result=await client.audio.transcriptions.create(args);
    const ms=Math.round(performance.now()-started),text=result.text;
    const expected=sketch[index],action=scripted(text,context)?.action||'llm-fallback';
    const row={round,clip,model,ms,text,expected:expected.text,action,expectedAction:expected.action,actionCorrect:action===expected.action,exact:normalize(text)===normalize(expected.text)};
    rows.push(row);console.log(JSON.stringify(row));
   }catch(error:any){
    rows.push({round,clip,model,ms:Math.round(performance.now()-started),error:error.message,status:error.status});
    console.log(JSON.stringify(rows.at(-1)));
    if([400,403,404].includes(error.status))unavailable.add(model);
   }
  }
 }
}
const summary=models.map(model=>{
 const samples=rows.filter(r=>r.model===model&&!r.error),times=samples.map(r=>r.ms);
 return {model,samples:samples.length,p50Ms:quantile(times,.5),p90Ms:quantile(times,.9),actionCorrect:samples.filter(r=>r.actionCorrect).length,exact:samples.filter(r=>r.exact).length,errors:rows.filter(r=>r.model===model&&r.error).length};
});
await fs.mkdir('benchmarks/latency',{recursive:true});
await fs.writeFile('benchmarks/latency/transcription.json',JSON.stringify({created:new Date().toISOString(),environment:'local client to OpenAI; real recorded sketch audio, not live microphone; sequential rotated order',summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
