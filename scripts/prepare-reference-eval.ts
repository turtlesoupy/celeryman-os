import 'dotenv/config';
import fs from 'node:fs/promises';
import {createHash,randomUUID,randomInt} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fal} from '@fal-ai/client';
import {costumes,motions} from '../src/dances.ts';
const exec=promisify(execFile),dir='public/reference-eval',archive='analysis/reference-eval-20261005';
await fs.mkdir(`${dir}/assets`,{recursive:true});await fs.mkdir(archive,{recursive:true});
const hash=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const sourceRows=JSON.parse(await fs.readFile('analysis/resolution-eval-20261005/requests.json','utf8'));
const anchors=[1,2].map(take=>sourceRows.find((r:any)=>r.caseId===`upload-celery-body-${take}`&&r.variant==='full'&&!r.error));
if(anchors.some(x=>!x))throw Error('Finish the resolution sweep first; its frozen 1K anchors are reused.');
let plan:any=await fs.readFile(`${archive}/plan.json`,'utf8').then(JSON.parse,()=>null);
if(!plan){
 const rounds=[1,2].flatMap(take=>[true,false].map(anchored=>({id:randomUUID(),take,anchored})));
 for(let i=rounds.length-1;i>0;i--){const j=randomInt(i+1);[rounds[i],rounds[j]]=[rounds[j],rounds[i]];}
 const sides=[true,true,false,false];for(let i=sides.length-1;i>0;i--){const j=randomInt(i+1);[sides[i],sides[j]]=[sides[j],sides[i]];}
 plan={id:randomUUID(),created:new Date().toISOString(),rounds:rounds.map((r,i)=>({...r,motionOnA:sides[i]}))};await fs.writeFile(`${archive}/plan.json`,JSON.stringify(plan,null,2));
}
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const photo=await fs.readFile('analysis/optimization-20261005/identity-upload.jpg'),motion=await fs.readFile('public/media/motion/celery-5s.mp4');
const reference=`assets/${hash(photo).slice(0,24)}.jpg`,motionAsset=`assets/${hash(motion).slice(0,24)}.mp4`;
await fs.writeFile(`${dir}/${reference}`,photo);await fs.writeFile(`${dir}/${motionAsset}`,motion);
const refUrl=await fal.storage.upload(new File([photo],'identity.jpg',{type:'image/jpeg'})),motionUrl=await fal.storage.upload(new File([motion],'motion.mp4',{type:'video/mp4'}));
const reportFile=`${archive}/requests.json`,records:any[]=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>[]);
const prompt=`Generate the SAME recognizable adult person depicted in the supplied still image references. Preserve facial proportions, hair, age appearance, body build, and presence or absence of facial hair and eyeglasses. All still references depict this same person. Dress the person in this complete outfit: ${costumes.celery}. The original identity photograph supplies identity only: never copy its clothing, scenery, pose or camera framing. Full body including shoes visible throughout, centered, occupying 80% of frame height, with margins above and below. Flat uniform light gray seamless studio background. Locked static camera, flat 1990s low-budget desktop dance footage. Choreography: ${motions.celery}. If a reference video is supplied, it guides ONLY choreography and timing, NEVER the actor's face, identity, hair or body build. The performer must remain the person from the still references. Exactly one coherent whole person; no pasted head, collage, other people, text, cuts or speech. Start moving immediately, repeat a rhythmic five-second cycle, end in the starting pose without stopping or fading.`;
const conditions=[{id:'anchor-motion',anchored:true,motion:true},{id:'anchor-text',anchored:true,motion:false},{id:'direct-motion',anchored:false,motion:true},{id:'direct-text',anchored:false,motion:false}];
for(let pass=0;pass<2;pass++)for(const take of [1,2])for(const c of take===1?conditions:[...conditions].reverse()){
 const anchor=anchors[take-1],caseId=`upload-celery-${take}`,seed=84560+take;
 const input={reference_image_urls:c.anchored?[anchor.url,refUrl]:[refUrl],...(c.motion?{reference_video_urls:[motionUrl]}:{}),prompt,duration:5,resolution:'480P',aspect_ratio:'9:16',prompt_expansion_mode:'disabled',seed};
 const stored={...input,reference_image_urls:c.anchored?[anchor.sha256,hash(photo)]:[hash(photo)],...(c.motion?{reference_video_urls:[hash(motion)]}:{})};
 const fingerprint=hash(JSON.stringify({caseId,condition:c.id,input:stored}));
 if(records.some(r=>r.fingerprint===fingerprint&&!r.error)||records.filter(r=>r.fingerprint===fingerprint&&r.error).length>=2)continue;
 const start=performance.now();console.log(`Preparing reference-factor take ${take}, condition ${conditions.indexOf(c)+1}`);
 try{
  const result:any=await fal.run('minimax/h3-max/reference-to-video',{input,abortSignal:AbortSignal.timeout(120000)}),requestMs=performance.now()-start;
  const response=await fetch(result.data.video.url,{signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error(`Download HTTP ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer()),file=randomUUID()+'.mp4';await fs.writeFile(`${archive}/${file}`,bytes);await fs.writeFile(`${dir}/assets/${file}`,bytes);
  const details=JSON.parse((await exec('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height,duration','-of','json',`${archive}/${file}`])).stdout).streams[0];
  records.push({caseId,take,condition:c.id,variant:c.id,anchored:c.anchored,motionReference:c.motion,kind:'video',model:'minimax/h3-max/reference-to-video',fingerprint,input:stored,requestMs,anchorRequestMs:c.anchored?anchor.requestMs:0,coldRequestSumMs:requestMs+(c.anchored?anchor.requestMs:0),completeMs:performance.now()-start,requestId:result.requestId,file,sha256:hash(bytes),...details,created:new Date().toISOString()});
 }catch(error){records.push({caseId,condition:c.id,fingerprint,error:String(error),detail:(error as any)?.body,elapsedMs:performance.now()-start,created:new Date().toISOString()});console.log('Failed attempt saved; one later retry permitted.');}
 await fs.writeFile(reportFile,JSON.stringify(records,null,2));
}
const labels:Record<string,string>={'anchor-motion':'Costume image + choreography video','anchor-text':'Costume image + text motion','direct-motion':'Identity photo + choreography video','direct-text':'Identity photo + text motion'};
const rounds:any[]=[],key:any[]=[];
for(const p of plan.rounds){
 const left=p.anchored?'anchor-motion':'direct-motion',right=p.anchored?'anchor-text':'direct-text';
 const samples=[left,right].map(condition=>records.find(r=>r.take===p.take&&r.condition===condition&&!r.error));
 if(samples.some(r=>!r))throw Error('Missing output; no silent substitution or omission.');
 const [a,b]=p.motionOnA?samples:[...samples].reverse();
 rounds.push({id:p.id,kind:'video',title:'Uploaded identity · Celery Man · Full body',reference,motion:motionAsset,brief:'Same person as the identity photo. Compare actual motion to the reference, and judge likeness and usability separately.',costume:costumes.celery,A:`assets/${a.file}`,B:`assets/${b.file}`});
 const reveal=(r:any)=>({...r,label:labels[r.condition],failures:records.filter(x=>x.fingerprint===r.fingerprint&&x.error).map(x=>({error:x.error,elapsedMs:x.elapsedMs}))});
 key.push({id:p.id,kind:'video',person:'upload',caseId:`upload-celery-${p.take}-${p.anchored?'anchor':'direct'}`,take:p.take,anchored:p.anchored,A:reveal(a),B:reveal(b)});
}
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id:plan.id,rounds},null,2));await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id:plan.id,key},null,2));await fs.writeFile(`${archive}/key.json`,JSON.stringify({id:plan.id,key},null,2));
console.log('Ready: http://127.0.0.1:5173/reference-eval/index.html');
