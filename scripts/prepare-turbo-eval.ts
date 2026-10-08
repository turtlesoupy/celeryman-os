import 'dotenv/config';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {fal} from '@fal-ai/client';
import {interactiveVideo} from '../server/interactive-video.ts';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes,motions} from '../src/dances.ts';
const dir='public/turbo-eval',archive='benchmarks/turbo-eval-20261006';
const hash=(v:any)=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const shuffle=<T>(v:T[])=>{for(let i=v.length-1;i>0;i--){const j=randomInt(i+1);[v[i],v[j]]=[v[j],v[i]];}return v;};
await fs.mkdir(`${dir}/assets`,{recursive:true});await fs.mkdir(archive,{recursive:true});
const people=[{id:'thomas',label:'Thomas',file:'reference/thomas-dimson.jpg'},{id:'upload',label:'Original upload',file:'analysis/optimization-20261005/identity-upload.jpg'},{id:'camera-tote',label:'Camera · gray T-shirt',file:'public/media/profiles/1e71bce3-34a3-43b6-8a99-7d5b80a172c8.jpg'}];
const cases=[['celery','base'],['celery','face'],['celery','engaged'],['oyster','base'],['oyster','face'],['oyster','smile'],['tayne','intro'],['tayne','base'],['tayne','sway'],['tayne','hat'],['tayne','flarhgunnstow'],['mozzarell','base'],['mozzarell','face']];
const planFile=`${archive}/plan.json`;
let plan:any=await fs.readFile(planFile,'utf8').then(JSON.parse,()=>null);
if(!plan){
 const rounds=[];
 // Alternate the odd side across identities; randomly assign sides and request order independently.
 for(const [pi,p] of people.entries()){
  const sides=shuffle(cases.map((_,i)=>(i+pi)%2===0));
  for(const [i,[character,variant]] of cases.entries()){
   const body={profile:p.id,character,variant,canonical:true,fastPath:true,costume:costumes[character],motion:motions[variant==='base'?character:variant]};
   // Capture exactly the input production fast mode would send; stop before inference or persistence.
   const run=fal.run;let input:any,model:any;const sentinel=Error('captured');
   (fal as any).run=async(m:any,opts:any)=>{model=m;input=opts.input;throw sentinel;};
   try{await interactiveVideo('eval-capture',body,{},async()=>`identity:${p.id}`);}catch(e){if(e!==sentinel)throw e;}finally{(fal as any).run=run;}
   assert.equal(model,'minimax/h3-max/reference-to-video');assert(input&&!input.reference_video_urls);
   rounds.push({id:randomUUID(),caseId:`${p.id}-${character}-${variant}`,person:p.id,personLabel:p.label,character,variant,body,input,model,turboOnA:sides[i],turboFirst:randomInt(2)===0,seed:82300+pi*100+i});
  }
 }
 plan={id:randomUUID(),created:new Date().toISOString(),people,rounds:shuffle(rounds),description:'Frozen production fast-path inputs versus direct-photo Turbo; 3 identities × 13 variants. One take each; paired seeds are not equivalent samples across models.'};
 await fs.writeFile(planFile,JSON.stringify(plan,null,2));
}
const records:any[]=await fs.readFile(`${archive}/requests.json`,'utf8').then(JSON.parse,()=>[]);
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const refs:any={};
for(const p of people){const bytes=await fs.readFile(p.file),asset=`assets/${hash(bytes).slice(0,24)}.jpg`;await fs.writeFile(`${dir}/${asset}`,bytes);refs[p.id]={asset,sha256:hash(bytes),url:await fal.storage.upload(new File([bytes],'identity.jpg',{type:'image/jpeg'}))};}
// Persist records serially even when independent cases run concurrently.
let saving=Promise.resolve();
async function save(){saving=saving.then(()=>fs.writeFile(`${archive}/requests.json`,JSON.stringify(records,null,2)));await saving;}
async function request(key:string,model:string,input:any,kind:string){
 const old=records.find(r=>r.key===key);if(old)return old; // Never hide or automatically retry failed requests.
 console.log('Generating',key);const start=performance.now();
 try{
  const result:any=await fal.run(model,{input,abortSignal:AbortSignal.timeout(180000)});const requestMs=performance.now()-start;
  const url=kind==='image'?result.data.images[0].url:result.data.video.url;
  const response=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),file=randomUUID()+(kind==='image'?'.png':'.mp4');await fs.writeFile(`${dir}/assets/${file}`,bytes);
  const row={key,model,input,kind,file,url,requestId:result.requestId,requestMs,completeMs:performance.now()-start,sha256:hash(bytes),inferenceMs:result.data.timings?.inference*1000};records.push(row);await save();console.log('Finished',key,Math.round(row.completeMs)+'ms');return row;
 }catch(e){const row={key,model,kind,error:String(e),elapsedMs:performance.now()-start};records.push(row);await save();console.log('FAILED',key,String(e));return row;}
}
async function generate(c:any){
 const ref=refs[c.person];
 for(const arm of c.turboFirst?['turbo','current']:['current','turbo']){
  const key=c.caseId+':'+arm;if(records.some(r=>r.key===key))continue;
  let input={...c.input,seed:c.seed,reference_image_urls:[ref.url]},anchor:any;
  if(arm==='turbo'){
   const {reference_image_urls,aspect_ratio,...rest}=input;
   input={...rest,image_url:ref.url} as any;
  }
  const row:any=await request(key,arm==='turbo'?'minimax/h3-max-turbo/image-to-video':c.model,input,'video');
  row.anchorRequestMs=anchor?.requestMs||0;row.coldRequestSumMs=(row.requestMs||0)+row.anchorRequestMs;
  row.pipelineMs=(row.completeMs||row.elapsedMs||0)+(anchor?.completeMs||0);
  row.estimatedVideoUsd=arm==='turbo'?.075:.25;row.regularVideoUsd=arm==='turbo'?.125:.25;
  row.anchorFile=anchor?.file;row.anchorFailures=[];row.failures=[];await save();
 }
}
let cursor=0;
await Promise.all([0,1].map(async()=>{while(cursor<plan.rounds.length){if(await fs.access('/tmp/celery-turbo-stop').then(()=>true,()=>false))break;await generate(plan.rounds[cursor++]);}}));
const rounds:any[]=[],key:any[]=[];
for(const c of plan.rounds){
 const current=records.find(r=>r.key===c.caseId+':current'),turbo=records.find(r=>r.key===c.caseId+':turbo');
 const pair=c.turboOnA?[turbo,current]:[current,turbo];
 const reveal=(r:any)=>({...r,input:undefined,url:undefined,label:r.key.endsWith(':turbo')?'Direct photo · H3 Max Turbo':'Production fast path · H3 Max reference',failures:r.error?[{error:r.error,elapsedMs:r.elapsedMs}]:[],anchorFailures:r.anchorFailures||[]});
 rounds.push({id:c.id,kind:'video',title:`${c.personLabel} · ${c.character} · ${c.variant}`,reference:refs[c.person].asset,motionText:c.body.motion,costume:c.body.costume,brief:'Judge identity, requested outfit/framing, movement, and whether you would ship each result. The opening frame counts. Intro: also listen to the spoken line. Print: judge suitability as a smiling printout.',A:pair[0]?.file?`assets/${pair[0].file}`:null,B:pair[1]?.file?`assets/${pair[1].file}`:null,errors:pair.map(r=>r?.error||null)});
 key.push({id:c.id,person:c.person,personLabel:c.personLabel,character:c.character,variant:c.variant,take:1,A:reveal(pair[0]),B:reveal(pair[1])});
}
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id:plan.id,rounds},null,2));await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id:plan.id,key},null,2));
console.log(`Ready: ${rounds.length} pairs; ${records.filter(r=>r.error).length} recorded failures. http://127.0.0.1:5173/turbo-eval/`);
