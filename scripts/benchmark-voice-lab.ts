import 'dotenv/config';import fs from 'node:fs/promises';import {performance} from 'node:perf_hooks';import {randomUUID} from 'node:crypto';
import {classicVoice,clonedStream,spliceVoice,pcmWav,labDir} from '../server/voice-lab.ts';
const root='public/voice-lab',reportFile=root+'/report.json';await fs.mkdir(labDir,{recursive:true});
const cases=[
 {id:'greeting-paul',text:'Good morning Paul. What will your first sequence of the day be?',reference:'/media/original/greeting.wav',split:'calibration'},
 {id:'greeting-thomas',text:'Good morning Thomas. What will your first sequence of the day be?',reference:'/media/original/greeting.wav',split:'personalized'},
 {id:'call-thomas',text:"Excuse me Thomas. Your wife is on the phone. It's an emergency.",reference:'/media/original/call.wav',split:'holdout'},
 {id:'yes-thomas',text:'Yes, Thomas!',reference:'/media/original/yes-paul.wav',split:'short holdout'},
 {id:'novel',text:'Thomas, your velvet turnip shuffle is ready. Shall I add a tiny purple hat?',reference:'/media/original/voice-reference.wav',split:'novel holdout'},
];
const report:any={created:new Date().toISOString(),version:1,notes:['Voice profile is already enrolled for both MiniMax tiers. No local generated-phrase cache is used for clone or classic trials. Provider-internal caching is unknown.','firstChunkMs is server receipt of PCM, not time to speaker output. completeMs is file readiness. Browser playback is measured separately.','Classic parameters were fitted only on Paul greeting. Holdout settings are frozen.','Splice uses the production implementation with an isolated name/output cache; existing source-word alignment is reused. Name-cold, name-warm, and exact-phrase-cache states are reported separately.','All outputs and failed trials are retained; no quality-based selection. Subjective model scores are advisory, not calibrated percentages.'],cases,candidates:[],errors:[]};
async function save(){await fs.writeFile(reportFile,JSON.stringify(report,null,2));await fs.mkdir('benchmarks/voice-lab',{recursive:true});await fs.writeFile('benchmarks/voice-lab/report.json',JSON.stringify(report,null,2));}
const methods=[{id:'classic-fred',label:'Classic Fred · fitted',kind:'classic',voice:'Fred'},{id:'classic-junior',label:'Classic Junior · fitted',kind:'classic',voice:'Junior'},{id:'turbo',label:'Full clone · MiniMax Turbo streaming',kind:'turbo'},{id:'hd',label:'Full clone · MiniMax HD streaming',kind:'hd'},{id:'splice',label:'Original phrase + generated name',kind:'splice'}];
const session='benchmark-'+randomUUID();
for(const c of cases){
 for(const m of methods){
  if(m.kind==='splice'&&(c.id==='novel'||c.id==='greeting-paul'))continue;
  const candidate:any={id:c.id+'-'+m.id,caseId:c.id,method:m.id,label:m.label,text:c.text,trials:[]};report.candidates.push(candidate);
  const repetitions=m.kind==='splice'?2:3;
  for(let trial=0;trial<repetitions;trial++){
   const start=performance.now(),out=`${labDir}/${candidate.id}-${trial+1}.wav`,stages:any[]=[];
   try{
    let details:any={};let url=out.replace('public','');
    if(m.kind==='classic')await classicVoice(c.text,m.voice!,out);
    else if(m.kind==='splice'){
     const source=await spliceVoice(c.text,session,stage=>stages.push({stage,atMs:performance.now()-start}));await fs.copyFile('public'+source,out);
     details={cacheState:trial?'exact phrase cached':c.id==='greeting-thomas'?'name cold (reference alignment warm)':'name warm, phrase cold',stages};
    }else{
     const result=await clonedStream(c.text,m.kind as 'turbo'|'hd',()=>{});await fs.writeFile(out,pcmWav(result.pcm));details={firstChunkMs:result.firstChunkMs,providerCompleteMs:result.completeMs,requestId:result.requestId};
    }
    const t={trial:trial+1,url,completeMs:performance.now()-start,...details};candidate.trials.push(t);candidate.url??=url;console.log(candidate.id,trial+1,JSON.stringify({firstChunkMs:t.firstChunkMs,completeMs:t.completeMs,cacheState:t.cacheState}));
   }catch(e){const failure={trial:trial+1,error:e instanceof Error?e.message:String(e),elapsedMs:performance.now()-start};candidate.trials.push(failure);report.errors.push({id:candidate.id,...failure});console.error(candidate.id,failure);}
   await save();
  }
 }
}
// Hidden positive and deliberately mismatched negative controls verify grader discrimination.
await fs.copyFile('public/media/original/greeting.wav',`${labDir}/control-positive.wav`);
const {execFileSync}=await import('node:child_process');execFileSync('say',['-v','Samantha','-r','180','-o',`${labDir}/control-negative.wav`,'--data-format=LEI16@24000',cases[0].text]);
report.controls=[{id:'control-positive',caseId:'greeting-paul',text:cases[0].text,url:'/voice-lab/audio/control-positive.wav'},{id:'control-negative',caseId:'greeting-paul',text:cases[0].text,url:'/voice-lab/audio/control-negative.wav'}];await save();
