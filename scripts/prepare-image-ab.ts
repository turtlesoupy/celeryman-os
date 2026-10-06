import 'dotenv/config';
import fs from 'node:fs/promises';
import {randomInt,randomUUID,createHash} from 'node:crypto';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes} from '../src/dances.ts';

const dir='public/image-ab',archive='analysis/image-model-ab-20261005';
await fs.mkdir(`${dir}/assets`,{recursive:true});await fs.mkdir(archive,{recursive:true});
fal.config({credentials:process.env.FAL_KEY});
const people=[{id:'thomas',label:'Thomas',file:'reference/thomas-dimson.jpg'},{id:'upload',label:'Uploaded identity',file:'analysis/optimization-20261005/identity-upload.jpg'}];
const reportFile=`${archive}/requests.json`;
const requests:any[]=await fs.readFile(reportFile,'utf8').then(JSON.parse,()=>[]);
const publicRounds:any[]=[],key:any[]=[];
const labels=['standard','lite','standard','lite','standard','lite','standard','lite'];
for(let i=labels.length-1;i>0;i--){const j=randomInt(i+1);[labels[i],labels[j]]=[labels[j],labels[i]];}
let n=0;
for(const person of people){
 const bytes=await fs.readFile(person.file),sourceHash=createHash('sha256').update(bytes).digest('hex');
 const reference=`assets/${randomUUID()}.jpg`;await fs.writeFile(`${dir}/${reference}`,bytes);
 const ref=await fal.storage.upload(new File([bytes],'identity.jpg',{type:'image/jpeg'}));
 for(const character of ['celery','oyster'])for(const closeup of [true,false]){
  const id=++n,seed=91820+id,canonical=character+(closeup?'-face':'');
  const normal=costumeFrameInput(ref,costumes[character],closeup,canonical,false,'1K');
  const caseHash=createHash('sha256').update(JSON.stringify({sourceHash,prompt:normal.prompt,seed,aspect:normal.aspect_ratio,version:1})).digest('hex');
  const models=['standard','lite'] as const,samples:Record<string,any>={};
  for(const variant of id%2?models:[...models].reverse()){
   let row=requests.find(r=>r.caseHash===caseHash&&r.variant===variant&&!r.error);
   if(!row){
    const model=variant==='lite'?'google/nano-banana-lite/edit':'fal-ai/nano-banana-2/edit';
    const {resolution,...common}=normal;
    const start=performance.now();
    try{
     const response:any=await fal.run(model,{input:{...common,...(variant==='standard'?{resolution}:{}),num_images:1,seed},abortSignal:AbortSignal.timeout(90000)});
     const requestMs=performance.now()-start,file=randomUUID()+'.png';
     const image=await fetch(response.data.images[0].url,{signal:AbortSignal.timeout(30000)});if(!image.ok)throw Error('Download failed');
     const bytes=Buffer.from(await image.arrayBuffer());await fs.writeFile(`${archive}/${file}`,bytes);
     row={id,caseHash,person:person.id,character,closeup,seed,variant,model,prompt:normal.prompt,aspectRatio:normal.aspect_ratio,resolution:'1K',outputFormat:'png',requestMs,completeMs:performance.now()-start,requestId:response.requestId,file,sha256:createHash('sha256').update(bytes).digest('hex')};
    }catch(error){requests.push({id,caseHash,variant,error:String(error)});await fs.writeFile(reportFile,JSON.stringify(requests,null,2));throw error;}
    requests.push(row);await fs.writeFile(reportFile,JSON.stringify(requests,null,2));
   }
   await fs.copyFile(`${archive}/${row.file}`,`${dir}/assets/${row.file}`);
   samples[variant]=row;
   console.log(`Prepared ${id}/8, sample ${Object.keys(samples).length}/2`);
  }
  const a=labels[id-1],b=a==='lite'?'standard':'lite';
  publicRounds.push({id,title:`${person.label} · ${character==='celery'?'Celery Man':'Oyster'} · ${closeup?'Portrait':'Full body'}`,reference,brief:`${closeup?'Tight head-and-shoulders portrait on hot pink.':'Entire person visible, with margins, on light gray.'} Preserve the person’s face, hair, facial hair, and eyewear.`,costume:costumes[character],prompt:normal.prompt,A:`assets/${samples[a].file}`,B:`assets/${samples[b].file}`});
  key.push({id,A:{model:a,requestMs:samples[a].requestMs},B:{model:b,requestMs:samples[b].requestMs}});
 }
}
const id=randomUUID();
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id,rounds:publicRounds},null,2));
await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id,key},null,2));
await fs.writeFile(`${archive}/key.json`,JSON.stringify({id,key},null,2));
console.log('Ready: http://127.0.0.1:5173/image-ab/index.html');
