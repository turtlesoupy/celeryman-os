import 'dotenv/config';
import fs from 'node:fs/promises';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes} from '../src/dances.ts';

const dir='public/image-sweep',archive='analysis/image-sweep-20261005';
await fs.mkdir(`${dir}/assets`,{recursive:true});
await fs.mkdir(archive,{recursive:true});
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const reportFile=`${archive}/requests.json`;
const requests:any[]=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>[]);
const cases=[
 {id:'upload-celery-1',person:'upload',character:'celery',closeup:true,seed:61921},
 {id:'upload-celery-2',person:'upload',character:'celery',closeup:true,seed:61922},
 {id:'upload-oyster-body',person:'upload',character:'oyster',closeup:false,seed:61923},
 {id:'thomas-oyster',person:'thomas',character:'oyster',closeup:true,seed:61924},
];
const variants=[
 {id:'original',label:'NB2 · original prompt · 1K',model:'fal-ai/nano-banana-2/edit'},
 {id:'clean',label:'NB2 · clarified prompt · 1K',model:'fal-ai/nano-banana-2/edit'},
 {id:'half',label:'NB2 · clarified prompt · 0.5K',model:'fal-ai/nano-banana-2/edit'},
 {id:'seedream',label:'Seedream 5.0 Flash · ~1K',model:'bytedance/seedream/v5/flash/edit'},
 {id:'flare',label:'GPT Image 2.5 Flare · medium · ~1K',model:'openai/gpt-image-2.5/flare/edit'},
];
const people:Record<string,any>={
 upload:{label:'Uploaded identity',file:'analysis/optimization-20261005/identity-upload.jpg'},
 thomas:{label:'Thomas',file:'reference/thomas-dimson.jpg'},
};
for(const person of Object.values(people)){
 const bytes=await fs.readFile(person.file);
 person.sourceHash=createHash('sha256').update(bytes).digest('hex');
 person.reference=`assets/${person.sourceHash.slice(0,24)}.jpg`;
 await fs.writeFile(`${dir}/${person.reference}`,bytes);
 person.url=await fal.storage.upload(new File([bytes],'identity.jpg',{type:'image/jpeg'}));
}
function clarified(prompt:string,closeup:boolean,character:string){
 return prompt.replace('new coherent whole-person photograph',closeup?'new head-and-shoulders photograph':'new coherent whole-person photograph')
  .replace('hat nearly touches the top edge',character==='oyster'?'top of the beanie nearly touches the top edge':'top of the hair nearly touches the top edge')
  +(character==='celery'?' No hat or headwear.':'');
}
let failures=0;
// Sequential, interleaved requests avoid client-side concurrency confounding latency.
for(let i=0;i<cases.length;i++){
 const c=cases[i],person=people[c.person];
 const normal=costumeFrameInput(person.url,costumes[c.character],c.closeup,c.character+(c.closeup?'-face':''),false,'1K');
 const ordered=[...variants.slice(i),...variants.slice(0,i)];
 for(const variant of ordered){
  const prompt=variant.id==='original'?normal.prompt:clarified(normal.prompt,c.closeup,c.character);
  const input:any=variant.model==='fal-ai/nano-banana-2/edit'
   ?{...normal,prompt,resolution:variant.id==='half'?'0.5K':'1K',num_images:1,seed:c.seed}
   :{prompt,image_urls:[person.url],image_size:{width:1216,height:912},num_images:1,output_format:'png',...(variant.id==='flare'?{quality:'medium'}:{})};
  const hashInput={...input,image_urls:[person.sourceHash]};
  const caseHash=createHash('sha256').update(JSON.stringify({case:c.id,model:variant.model,input:hashInput,...(variant.id==='clean'&&!c.closeup?{repeat:2}:{})})).digest('hex');
  let row=requests.find(r=>r.caseHash===caseHash&&!r.error);
  if(!row){
   const start=performance.now();
   console.log(`Generating case ${i+1}/${cases.length}, variant ${variants.indexOf(variant)+1}/${variants.length}`);
   try{
    const response:any=await fal.run(variant.model,{input,abortSignal:AbortSignal.timeout(180000)});
    const requestMs=performance.now()-start;
    const download=await fetch(response.data.images[0].url,{signal:AbortSignal.timeout(45000)});
    if(!download.ok)throw Error(`Image download failed: ${download.status}`);
    const bytes=Buffer.from(await download.arrayBuffer()),file=randomUUID()+'.png';
    if(bytes.subarray(1,4).toString()!=='PNG')throw Error('Expected PNG output');
    await fs.writeFile(`${archive}/${file}`,bytes);
    row={caseId:c.id,caseHash,variant:variant.id,label:variant.label,model:variant.model,input:hashInput,requestMs,completeMs:performance.now()-start,requestId:response.requestId,file,width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20),sha256:createHash('sha256').update(bytes).digest('hex'),created:new Date().toISOString()};
    requests.push(row);
   }catch(error){
    failures++;
    requests.push({caseId:c.id,caseHash,variant:variant.id,model:variant.model,error:String(error),status:(error as any)?.status,detail:(error as any)?.body,elapsedMs:performance.now()-start,created:new Date().toISOString()});
    console.log(`Case ${i+1} variant failed: ${String(error)}`);
   }
   await fs.writeFile(reportFile,JSON.stringify(requests,null,2));
  }
  if(row)await fs.copyFile(`${archive}/${row.file}`,`${dir}/assets/${row.file}`);
 }
}
if(failures){console.log(`${failures} requests failed; rerun to retry only missing samples.`);process.exitCode=1;}
else{
 const comparisons=[
  {id:'prompt',label:'Prompt cleanup',left:'original',right:'clean'},
  {id:'resolution',label:'Resolution',left:'clean',right:'half'},
  {id:'seedream',label:'Seedream vs NB2',left:'clean',right:'seedream'},
  {id:'flare',label:'Flare vs NB2',left:'clean',right:'flare'},
 ];
 const rounds:any[]=[],key:any[]=[];
 const placement=[...Array(8).fill(true),...Array(8).fill(false)];
 for(let i=placement.length-1;i>0;i--){const j=randomInt(i+1);[placement[i],placement[j]]=[placement[j],placement[i]];}
 for(const c of cases)for(const comparison of comparisons){
  const id=rounds.length+1;
  const samples=Object.fromEntries(variants.map(v=>[v.id,requests.findLast(r=>r.caseId===c.id&&r.variant===v.id&&!r.error)]));
  const repeatControl=comparison.id==='prompt'&&samples.original.input.prompt===samples.clean.input.prompt;
  const [a,b]=placement[id-1]?[comparison.left,comparison.right]:[comparison.right,comparison.left];
  const person=people[c.person];
  rounds.push({id,title:`${person.label} · ${c.character==='celery'?'Celery Man':'Oyster'} · ${c.closeup?'Portrait':'Full body'}`,reference:person.reference,brief:`${c.closeup?'Tight head-and-shoulders portrait on hot pink.':'Entire person visible, with margins, on light gray.'} Preserve the person’s face, hair, facial hair, and eyewear.`,costume:costumes[c.character],A:`assets/${samples[a].file}`,B:`assets/${samples[b].file}`});
  const reveal=(v:string)=>({variant:v,label:repeatControl?`NB2 · 1K · repeat ${v==='original'?1:2}`:samples[v].label,requestMs:samples[v].requestMs,width:samples[v].width,height:samples[v].height,failedAttempts:requests.filter(r=>r.caseId===c.id&&r.variant===v&&r.error).map(r=>({error:r.error,status:r.status,elapsedMs:r.elapsedMs})),prompt:samples[v].input.prompt});
  key.push({id,caseId:c.id,comparison:repeatControl?'repeatability':comparison.id,comparisonLabel:repeatControl?'Repeatability control (same settings)':comparison.label,left:comparison.left,right:comparison.right,A:reveal(a),B:reveal(b)});
 }
 // Shuffle round order independently of which sample appears on each side.
 for(let i=rounds.length-1;i>0;i--){const j=randomInt(i+1);[rounds[i],rounds[j]]=[rounds[j],rounds[i]];}
 const id=randomUUID();
 await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id,rounds},null,2));
 await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id,key},null,2));
 await fs.writeFile(`${archive}/key.json`,JSON.stringify({id,key},null,2));
 console.log('Ready: http://127.0.0.1:5173/image-sweep/index.html');
}
