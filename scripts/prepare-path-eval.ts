import 'dotenv/config';
import fs from 'node:fs/promises';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes} from '../src/dances.ts';
import {motionPrompt} from '../server/choreography.ts';
const exec=promisify(execFile),dir='public/path-eval',archive='analysis/path-eval-20261005';
await fs.mkdir(`${dir}/assets`,{recursive:true});await fs.mkdir(archive,{recursive:true});
const hash=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
function shuffle<T>(rows:T[]){for(let i=rows.length-1;i>0;i--){const j=randomInt(i+1);[rows[i],rows[j]]=[rows[j],rows[i]];}return rows;}
const cases=[
 {id:'upload-celery-portrait',person:'upload',character:'celery',closeup:true,image:true,video:false},
 {id:'upload-oyster-body',person:'upload',character:'oyster',closeup:false,image:true,video:true},
 {id:'thomas-celery-body',person:'thomas',character:'celery',closeup:false,image:true,video:true},
 {id:'upload-celery-body',person:'upload',character:'celery',closeup:false,image:false,video:true},
].flatMap(c=>[0,1].map(take=>({...c,id:`${c.id}-${take+1}`,take,seed:82340+take,videoSeed:62340+take})));
const planFile=`${archive}/plan.json`;
let plan:any=await fs.readFile(planFile,'utf8').then(JSON.parse,()=>null);
if(!plan){
 const imageCases=shuffle(cases.filter(c=>c.image).map(c=>c.id)),videoCases=shuffle(cases.filter(c=>c.video).map(c=>c.id));
 const imageSides=shuffle([true,true,true,false,false,false]),videoSides=shuffle([true,true,true,false,false,false]);
 plan={id:randomUUID(),created:new Date().toISOString(),cases,rounds:[...imageCases.map((caseId,i)=>({id:randomUUID(),kind:'image',caseId,baselineOnA:imageSides[i]})),...videoCases.map((caseId,i)=>({id:randomUUID(),kind:'video',caseId,baselineOnA:videoSides[i]}))]};
 await fs.writeFile(planFile,JSON.stringify(plan,null,2));
}
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const reportFile=`${archive}/requests.json`,records:any[]=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>[]);
const refs:Record<string,any>={};
for(const [id,file] of Object.entries({upload:'analysis/optimization-20261005/identity-upload.jpg',thomas:'reference/thomas-dimson.jpg'})){
 const normalized=`${archive}/${id}-reference.jpg`;
 if(id==='thomas')await exec('sips',['-Z','2048',file,'--out',normalized]);else await fs.copyFile(file,normalized);
 const bytes=await fs.readFile(normalized),digest=hash(bytes),asset=`assets/${digest.slice(0,24)}.jpg`;
 await fs.writeFile(`${dir}/${asset}`,bytes);
 refs[id]={asset,hash:digest,url:await fal.storage.upload(new File([bytes],'identity.jpg',{type:'image/jpeg'}))};
}
const motions:Record<string,any>={};
for(const character of ['celery','oyster']){
 const bytes=await fs.readFile(`public/media/motion/${character}-5s.mp4`),digest=hash(bytes),asset=`assets/${digest.slice(0,24)}.mp4`;
 await fs.writeFile(`${dir}/${asset}`,bytes);
 motions[character]={asset,hash:digest,url:await fal.storage.upload(new File([bytes],'motion.mp4',{type:'video/mp4'}))};
}
async function request(c:any,variant:string,model:string,input:any,provenance:any,kind:'image'|'video'){
 const sanitized={...input};for(const k of ['image_urls','reference_image_urls','reference_video_urls','image_url'])if(k in sanitized)sanitized[k]=provenance[k];
 const fingerprint=hash(JSON.stringify({caseId:c.id,variant,model,input:sanitized}));
 const old=records.find(r=>r.fingerprint===fingerprint&&!r.error);if(old)return old;
 if(records.filter(r=>r.fingerprint===fingerprint&&r.error).length>=2)return undefined;
 const start=performance.now();console.log(`Preparing ${kind} ${c.id}, ${variant}`);
 try{
  const result:any=await fal.run(model,{input,abortSignal:AbortSignal.timeout(120000)}),requestMs=performance.now()-start;
  const url=kind==='image'?result.data.images[0].url:result.data.video.url;
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),file=`${randomUUID()}.${kind==='image'?'png':'mp4'}`;
  await fs.writeFile(`${archive}/${file}`,bytes);await fs.writeFile(`${dir}/assets/${file}`,bytes);
  const details=kind==='image'?{width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)}:JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration','-of','json',`${archive}/${file}`])).stdout).streams[0];
  const row={caseId:c.id,variant,kind,model,input:sanitized,fingerprint,requestMs,completeMs:performance.now()-start,requestId:result.requestId,file,url,sha256:hash(bytes),...details,created:new Date().toISOString()};
  records.push(row);await fs.writeFile(reportFile,JSON.stringify(records,null,2));return row;
 }catch(error){records.push({caseId:c.id,variant,kind,model,fingerprint,error:String(error),status:(error as any)?.status,detail:(error as any)?.body,elapsedMs:performance.now()-start,created:new Date().toISOString()});await fs.writeFile(reportFile,JSON.stringify(records,null,2));console.log('Request failed; preserved for one later retry.');return undefined;}
}
// Fixed design, first successful output, no semantic rerolls, sequential alternating calls.
for(let pass=0;pass<2;pass++)for(const c of cases){
 const ref=refs[c.person],normal=costumeFrameInput(ref.url,costumes[c.character],c.closeup,c.character+(c.closeup?'-face':''),false,'1K');
 for(const variant of c.image?(c.take%2?['qwen','nb2']:['nb2','qwen']):['nb2']){
  const input=variant==='nb2'?{...normal,num_images:1,seed:c.seed}:{prompt:normal.prompt,image_urls:[ref.url],image_size:normal.aspect_ratio==='4:3'?{width:1200,height:896}:{width:768,height:1376},num_images:1,seed:c.seed,output_format:'png',enable_prompt_expansion:false};
  await request(c,variant,variant==='nb2'?'fal-ai/nano-banana-2/edit':'alibaba/qwen-image-3/edit',input,{image_urls:[ref.hash]},'image');
 }
 if(!c.video)continue;
 const anchor=records.find(r=>r.caseId===c.id&&r.variant==='nb2'&&!r.error),motion=motions[c.character];
 const prompt=motionPrompt(c.character)+` All still images depict the SAME adult person: preserve their recognizable face, facial proportions, hair, body build, facial hair and eyeglasses. Dress this person in the complete outfit: ${costumes[c.character]}. Video 1 supplies ONLY choreography, timing, camera framing, lighting and background, never its actor's identity, face, hair or body build. Any second still image is the original photo of the same person; use it for identity only, never its clothing or scenery. Exactly one coherent whole dancer, entirely in frame. No pasted head or cutout. No speech, text, cuts or camera movement.`;
 for(const variant of c.take%2?['direct','anchored']:['anchored','direct']){
  if(variant==='anchored'&&!anchor)continue;
  const anchored=variant==='anchored';
  const input={reference_image_urls:anchored?[anchor.url,ref.url]:[ref.url],reference_video_urls:[motion.url],...(anchored&&c.character==='oyster'?{image_url:anchor.url}:{}),prompt,duration:5,resolution:'480P',aspect_ratio:normal.aspect_ratio,prompt_expansion_mode:'disabled',seed:c.videoSeed};
  const row=await request(c,variant,'minimax/h3-max/reference-to-video',input,{reference_image_urls:anchored?[anchor.sha256,ref.hash]:[ref.hash],reference_video_urls:[motion.hash],...(anchored&&c.character==='oyster'?{image_url:anchor.sha256}:{})},'video');
  if(row){row.anchorRequestMs=anchored?anchor.requestMs:0;row.coldRequestSumMs=row.requestMs+row.anchorRequestMs;}
 }
 await fs.writeFile(reportFile,JSON.stringify(records,null,2));
}
const labels:Record<string,string>={nb2:'Nano Banana 2 · 1K',qwen:'Qwen Image 3 · prompt expansion off',anchored:'1K costume image → H3 Max',direct:'Identity photo → H3 Max'};
const rounds:any[]=[],key:any[]=[];
for(const p of plan.rounds){
 const c=cases.find(c=>c.id===p.caseId)!;
 const variants=p.kind==='image'?['nb2','qwen']:['anchored','direct'];
 const samples=variants.map(v=>records.find(r=>r.caseId===c.id&&r.variant===v&&!r.error));
 if(samples.some(s=>!s))throw Error(`Missing sample in ${c.id}; failures are archived, no silent omission.`);
 const [a,b]=p.baselineOnA?samples:[...samples].reverse();
 rounds.push({id:p.id,kind:p.kind,title:`${c.person==='upload'?'Uploaded identity':'Thomas'} · ${c.character==='celery'?'Celery Man':'Oyster'} · ${c.closeup?'Portrait':'Full body'}`,reference:refs[c.person].asset,motion:p.kind==='video'?motions[c.character].asset:undefined,brief:c.closeup?'Tight head-and-shoulders portrait on hot pink.':'Whole person visible with margins. For video, match the reference choreography, timing and camera framing.',costume:costumes[c.character],A:`assets/${a.file}`,B:`assets/${b.file}`});
 const reveal=(s:any)=>({...s,url:undefined,label:labels[s.variant],anchorFailures:s.variant==='anchored'?records.filter(r=>r.caseId===s.caseId&&r.variant==='nb2'&&r.error).map(r=>({error:r.error,elapsedMs:r.elapsedMs})):[],failures:records.filter(r=>r.caseId===s.caseId&&r.variant===s.variant&&r.error).map(r=>({error:r.error,elapsedMs:r.elapsedMs}))});
 key.push({id:p.id,kind:p.kind,caseId:c.id,person:c.person,take:c.take+1,A:reveal(a),B:reveal(b)});
}
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id:plan.id,rounds},null,2));
await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id:plan.id,key},null,2));
await fs.writeFile(`${archive}/key.json`,JSON.stringify({id:plan.id,key},null,2));
console.log('Ready: http://127.0.0.1:5173/path-eval/index.html');
