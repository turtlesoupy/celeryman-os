import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fal} from '@fal-ai/client';
import {costumes} from '../src/dances.ts';
import {motionPrompt} from '../server/choreography.ts';
const exec=promisify(execFile),dir='public/choreography-eval',archive='analysis/choreography-eval-20261005';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
await fs.mkdir(`${dir}/assets`,{recursive:true});await fs.mkdir(archive,{recursive:true});
const sourceRows=JSON.parse(await fs.readFile('analysis/resolution-eval-20261005/requests.json','utf8'));
const cases=['celery','oyster'].flatMap(character=>[1,2].map(take=>({character,take,caseId:`upload-${character}-body-${take}`})));
const motionOnlyPrompt='Generate the complete recognizable person from the still image references performing the movement in Video 1. Use Video 1 ONLY to guide body movement and timing: foot placements, steps, weight shifts, knee bends, hip and torso angles, arm and hand trajectories, head turns, rhythm and phase. Preserve the exact sequence and timing of those movements. The still images determine the performer’s face, facial proportions, hair, body proportions, costume and appearance throughout. Do not copy the reference actor’s face, hair, physique or facial appearance. Render one coherent whole person, with natural anatomy and no pasted head. Keep the whole body and shoes visible with margins and a fixed camera. No new movements, camera motion, speech, text or other people.';
let plan:any=await fs.readFile(`${archive}/plan.json`,'utf8').then(JSON.parse,()=>null);
if(!plan){
 const rounds=cases.map(c=>({...c,id:randomUUID()}));
 const shuffle=(a:any[])=>{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
 shuffle(rounds);const sides=shuffle([true,true,false,false]);
 plan={id:randomUUID(),created:new Date().toISOString(),motionOnlyPrompt,rounds:rounds.map((r,i)=>({...r,baselineOnA:sides[i]}))};
 await fs.writeFile(`${archive}/plan.json`,JSON.stringify(plan,null,2));
}
assert.equal(plan.motionOnlyPrompt,motionOnlyPrompt,'Do not silently change a frozen experiment.');
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const photo=await fs.readFile('analysis/optimization-20261005/identity-upload.jpg');
const reference=`assets/${hash(photo).slice(0,24)}.jpg`;await fs.writeFile(`${dir}/${reference}`,photo);
const refUrl=await fal.storage.upload(new File([photo],'identity.jpg',{type:'image/jpeg'}));
const motionRefs:Record<string,any>={},anchorRefs:Record<string,any>={};
for(const character of ['celery','oyster']){
 const bytes=await fs.readFile(`public/media/motion/${character}-5s.mp4`),sha256=hash(bytes),asset=`assets/${sha256.slice(0,24)}.mp4`;
 await fs.writeFile(`${dir}/${asset}`,bytes);
 motionRefs[character]={sha256,asset,url:await fal.storage.upload(new File([bytes],'motion.mp4',{type:'video/mp4'}))};
}
for(const c of cases){
 const anchor=sourceRows.find((r:any)=>r.caseId===c.caseId&&r.variant==='half'&&!r.error);assert(anchor);assert.equal(anchor.input.resolution,'0.5K');
 const bytes=await fs.readFile(`analysis/resolution-eval-20261005/${anchor.file}`);assert.equal(hash(bytes),anchor.sha256);
 anchorRefs[c.caseId]={...anchor,url:await fal.storage.upload(new File([bytes],'costume.png',{type:'image/png'}))};
}
const reportFile=`${archive}/requests.json`,records:any[]=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>[]);
for(let pass=0;pass<2;pass++)for(const c of cases)for(const variant of c.take===1?['current','motion-only']:['motion-only','current']){
 const baseline=sourceRows.find((r:any)=>r.caseId===c.caseId&&r.variant==='half-video'&&!r.error);assert(baseline);
 const anchor=anchorRefs[c.caseId],motion=motionRefs[c.character],prefix=motionPrompt(c.character);
 assert(baseline.input.prompt.startsWith(prefix));
 assert.equal(baseline.input.reference_image_urls[0],anchor.sha256);assert.equal(baseline.input.reference_image_urls[1],hash(photo));assert.equal(baseline.input.reference_video_urls[0],motion.sha256);
 const prompt=variant==='current'?baseline.input.prompt:plan.motionOnlyPrompt+baseline.input.prompt.slice(prefix.length);
 const stored={...baseline.input,prompt};
 const input={...stored,reference_image_urls:[anchor.url,refUrl],reference_video_urls:[motion.url],...(stored.image_url?{image_url:anchor.url}:{})};
 const model=baseline.model,fingerprint=hash(JSON.stringify({caseId:c.caseId,variant,model,input:stored}));
 if(records.some(r=>r.fingerprint===fingerprint&&!r.error)||records.filter(r=>r.fingerprint===fingerprint&&r.error).length>=2)continue;
 const start=performance.now();console.log(`Preparing ${c.caseId}, ${variant}`);
 try{
  const result:any=await fal.run(model,{input,abortSignal:AbortSignal.timeout(120000)}),requestMs=performance.now()-start;
  const response=await fetch(result.data.video.url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),file=randomUUID()+'.mp4';await fs.writeFile(`${archive}/${file}`,bytes);await fs.writeFile(`${dir}/assets/${file}`,bytes);
  const details=JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration','-of','json',`${archive}/${file}`])).stdout).streams[0];
  records.push({...c,variant,kind:'video',model,fingerprint,input:stored,requestMs,anchorRequestMs:anchor.requestMs,coldRequestSumMs:requestMs+anchor.requestMs,completeMs:performance.now()-start,requestId:result.requestId,file,sha256:hash(bytes),...details,created:new Date().toISOString()});
 }catch(error){records.push({caseId:c.caseId,variant,fingerprint,error:String(error),detail:(error as any)?.body,elapsedMs:performance.now()-start,created:new Date().toISOString()});console.log('Saved failure; at most one retry.');}
 await fs.writeFile(reportFile,JSON.stringify(records,null,2));
}
const rounds:any[]=[],key:any[]=[];
for(const p of plan.rounds){
 const samples=['current','motion-only'].map(variant=>records.find(r=>r.caseId===p.caseId&&r.variant===variant&&!r.error));assert(samples.every(Boolean),'Missing output; no omission or substitution.');
 const [a,b]=p.baselineOnA?samples:[...samples].reverse();
 rounds.push({id:p.id,kind:'video',title:`Uploaded identity · ${p.character==='celery'?'Celery Man':'Oyster'} · Full body`,reference,motion:motionRefs[p.character].asset,brief:'Judge likeness against the identity photo and actual steps, body movement and timing against the choreography reference.',costume:costumes[p.character],A:`assets/${a.file}`,B:`assets/${b.file}`});
 const reveal=(s:any)=>({...s,label:s.variant==='current'?'Current production prompt':'Movement-only reference prompt',failures:records.filter(r=>r.fingerprint===s.fingerprint&&r.error).map(r=>({error:r.error,elapsedMs:r.elapsedMs}))});
 key.push({id:p.id,kind:'video',person:'upload',caseId:p.caseId,take:p.take,A:reveal(a),B:reveal(b)});
}
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id:plan.id,rounds},null,2));await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id:plan.id,key},null,2));await fs.writeFile(`${archive}/key.json`,JSON.stringify({id:plan.id,key},null,2));
console.log('Ready: http://127.0.0.1:5173/choreography-eval/index.html');
