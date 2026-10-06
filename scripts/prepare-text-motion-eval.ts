import 'dotenv/config';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes,motions} from '../src/dances.ts';
const exec=promisify(execFile),dir='public/text-motion-eval',archive='analysis/text-motion-eval-20261005';
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const shuffle=<T>(a:T[])=>{for(let i=a.length-1;i>0;i--){const j=randomInt(i+1);[a[i],a[j]]=[a[j],a[i]];}return a;};
await fs.mkdir(`${dir}/assets`,{recursive:true});await fs.mkdir(archive,{recursive:true});
const people=[
 {id:'upload',label:'Original upload',file:'analysis/optimization-20261005/identity-upload.jpg'},
 {id:'thomas',label:'Thomas',file:'reference/thomas-dimson.jpg'},
 {id:'camera-tote',label:'Camera · gray T-shirt',file:'public/media/profiles/1e71bce3-34a3-43b6-8a99-7d5b80a172c8.jpg'},
 ...(!process.argv.includes('--newest-only')?[
  {id:'camera-beard',label:'Camera · bearded close-up',file:'public/media/profiles/e5d00f26-4477-49b0-b223-bfbfd692d144.jpg'},
  {id:'camera-cap',label:'Camera · cap and hoodie',file:'public/media/profiles/90599523-a143-49d0-9745-29911c0e1d11.jpg'},
 ]:[]),
];
const dances=[{id:'celery',label:'Celery Man',outfit:'celery'},{id:'oyster',label:'Oyster',outfit:'oyster'},{id:'tayne',label:'Tayne',outfit:'tayne'},{id:'flarhgunnstow',label:'Flarhgunnstow',outfit:'tayne'}];
const specs=people.flatMap(p=>dances.flatMap((d,i)=>[1,2].map(take=>({id:randomUUID(),caseId:`${p.id}-${d.id}-${take}`,person:p.id,personLabel:p.label,character:d.id,danceLabel:d.label,outfit:d.outfit,costume:costumes[d.outfit],motionText:motions[d.id],take,seed:61800+i*100+take,anchorSeed:41700+['celery','oyster','tayne'].indexOf(d.outfit)*100+take}))));
let plan:any=await fs.readFile(`${archive}/plan.json`,'utf8').then(JSON.parse,()=>null);
if(!plan){
 // Balanced sides within each source photo, plus an independent inference order.
 const rounds=shuffle(people.flatMap(p=>{const rows=shuffle(specs.filter(c=>c.person===p.id)),sides=shuffle([true,true,true,true,false,false,false,false]);return rows.map((r,i)=>({...r,anchorOnA:sides[i]}));}));
 plan={id:randomUUID(),created:new Date().toISOString(),people,dances,rounds,requestOrder:shuffle(specs.map(c=>c.caseId))};
 await fs.writeFile(`${archive}/plan.json`,JSON.stringify(plan,null,2));
}
assert.deepEqual(plan.people,people,'Use the same source selection when resuming the frozen experiment.');
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const refs:Record<string,any>={},targets:Record<string,string>={};
for(const p of people){
 const file=`${archive}/${p.id}-reference.jpg`;
 if(p.id==='thomas')await exec('sips',['-Z','2048',p.file,'--out',file]);else await fs.copyFile(p.file,file);
 const bytes=await fs.readFile(file),sha256=hash(bytes),asset=`assets/${sha256.slice(0,24)}.jpg`;
 await fs.writeFile(`${dir}/${asset}`,bytes);
 refs[p.id]={sha256,asset,url:await fal.storage.upload(new File([bytes],'identity.jpg',{type:'image/jpeg'}))};
}
// These clips are local evaluation targets only. Never upload them to a model.
for(const d of dances){
 const bytes=await fs.readFile(`public/media/motion/${d.id}-5s.mp4`),asset=`assets/${hash(bytes).slice(0,24)}.mp4`;
 await fs.writeFile(`${dir}/${asset}`,bytes);targets[d.id]=asset;
}
const reportFile=`${archive}/requests.json`,records:any[]=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>[]);
async function request(caseId:string,variant:string,kind:'image'|'video',model:string,input:any,stored:any,extra:any={}){
 assert(!input.reference_video_urls&&!input.video_url);
 const fingerprint=hash(JSON.stringify({caseId,variant,model,input:stored}));
 const prior=records.find(r=>r.fingerprint===fingerprint&&!r.error);if(prior)return prior;
 if(records.filter(r=>r.fingerprint===fingerprint&&r.error).length>=2)return;
 const start=performance.now();console.log(`Preparing ${caseId}, ${variant}`);
 try{
  const result:any=await fal.run(model,{input,abortSignal:AbortSignal.timeout(120000)}),requestMs=performance.now()-start;
  const url=kind==='image'?result.data.images[0].url:result.data.video.url;
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),file=randomUUID()+(kind==='image'?'.png':'.mp4');
  await fs.writeFile(`${archive}/${file}`,bytes);await fs.writeFile(`${dir}/assets/${file}`,bytes);
  const details=kind==='image'?{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}:JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration','-of','json',`${archive}/${file}`])).stdout).streams[0];
  const row={caseId,variant,kind,model,fingerprint,input:stored,...extra,requestMs,completeMs:performance.now()-start,requestId:result.requestId,file,url,sha256:hash(bytes),...details,created:new Date().toISOString()};
  if(kind==='video')row.coldRequestSumMs=requestMs+(extra.anchorRequestMs||0);
  records.push(row);await fs.writeFile(reportFile,JSON.stringify(records,null,2));return row;
 }catch(error){records.push({caseId,variant,kind,fingerprint,error:String(error),detail:(error as any)?.body,elapsedMs:performance.now()-start,created:new Date().toISOString()});await fs.writeFile(reportFile,JSON.stringify(records,null,2));console.log('Failure recorded; at most one later retry.');}
}
for(let pass=0;pass<2;pass++)for(const caseId of plan.requestOrder){
 const c=plan.rounds.find((c:any)=>c.caseId===caseId),ref=refs[c.person],anchorCase=`${c.person}-${c.outfit}-${c.take}`;
 const imageInput={...costumeFrameInput(ref.url,c.costume,false,c.outfit,false,'0.5K'),num_images:1,seed:c.anchorSeed};
 const anchor=await request(anchorCase,'anchor','image','fal-ai/nano-banana-2/edit',imageInput,{...imageInput,image_urls:[ref.sha256]},{person:c.person,outfit:c.outfit,take:c.take});
 const prompt=`Generate the SAME recognizable adult person depicted in Image 1, the original identity photograph. Preserve facial proportions, hair, age appearance, body build, and presence or absence of facial hair and eyeglasses, except eyewear or headwear explicitly specified by the costume. Any additional still reference depicts this same person already dressed in the requested costume and supplies costume and staging guidance. The original identity photograph supplies identity only: never copy its clothing, scenery, pose or camera framing. Dress the person in this complete outfit: ${c.costume}. Full body including shoes visible throughout, centered, occupying 80% of frame height, with margins above and below. Flat uniform light gray seamless studio background. Locked static camera, flat 1990s low-budget desktop dance footage. Choreography: ${c.motionText} Exactly one coherent whole person; no pasted head, collage, other people, text, cuts or speech. Start moving immediately, repeat a rhythmic five-second cycle, end in the starting pose without stopping or fading.`;
 for(const variant of c.take===1?['direct','anchored']:['anchored','direct']){
  if(variant==='anchored'&&!anchor)continue;
  const input={reference_image_urls:variant==='direct'?[ref.url]:[ref.url,anchor.url],prompt,duration:5,resolution:'480P',aspect_ratio:c.character==='oyster'?'4:3':'9:16',prompt_expansion_mode:'disabled',seed:c.seed};
  const stored={...input,reference_image_urls:variant==='direct'?[ref.sha256]:[ref.sha256,anchor.sha256]};
  await request(c.caseId,variant,'video','minimax/h3-max/reference-to-video',input,stored,{person:c.person,character:c.character,take:c.take,anchorCase:variant==='anchored'?anchorCase:undefined,anchorRequestMs:variant==='anchored'?anchor.requestMs:0});
 }
}
const rounds:any[]=[],key:any[]=[];
for(const c of plan.rounds){
 const samples=['anchored','direct'].map(variant=>records.find(r=>r.caseId===c.caseId&&r.variant===variant&&!r.error));assert(samples.every(Boolean),'Missing output; no silent omission or substitution.');
 const [a,b]=c.anchorOnA?samples:[...samples].reverse();
 rounds.push({id:c.id,kind:'video',title:`${c.personLabel} · ${c.danceLabel}`,reference:refs[c.person].asset,motion:targets[c.character],motionText:c.motionText,brief:'Neither model receives a choreography video. Judge the requested movement, recognizable likeness, and whether each result is usable.',costume:c.costume,A:`assets/${a.file}`,B:`assets/${b.file}`});
 const reveal=(s:any)=>({...s,url:undefined,label:s.variant==='anchored'?'0.5K costume image + text motion':'Identity photo + text motion',failures:records.filter(r=>r.fingerprint===s.fingerprint&&r.error).map(r=>({error:r.error,elapsedMs:r.elapsedMs})),anchorFailures:s.anchorCase?records.filter(r=>r.caseId===s.anchorCase&&r.variant==='anchor'&&r.error).map(r=>({error:r.error,elapsedMs:r.elapsedMs})):[]});
 key.push({id:c.id,kind:'video',person:c.person,personLabel:c.personLabel,character:c.character,caseId:c.caseId,take:c.take,A:reveal(a),B:reveal(b)});
}
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id:plan.id,rounds},null,2));await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id:plan.id,key},null,2));await fs.writeFile(`${archive}/key.json`,JSON.stringify({id:plan.id,key},null,2));
console.log(`Ready: ${rounds.length} pairs at http://127.0.0.1:5173/text-motion-eval/index.html`);
