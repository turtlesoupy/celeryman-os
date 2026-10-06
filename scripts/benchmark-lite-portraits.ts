import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes} from '../src/dances.ts';

// Experimental only: changing production defaults requires visual review of the
// generated images AND their animated counterparts, not just a latency win.
const photo=process.argv[2];
if(!photo)throw Error('Usage: tsx scripts/benchmark-lite-portraits.ts /path/to/regression-photo.jpg');
const out=path.resolve('analysis/optimization-20261005');
await fs.mkdir(out,{recursive:true});
fal.config({credentials:process.env.FAL_KEY});
const results:any[]=[];
for(const [person,file] of Object.entries({thomas:'reference/thomas-dimson.jpg',upload:photo})){
 const ref=await fal.storage.upload(new File([await fs.readFile(file)],'identity.jpg',{type:'image/jpeg'}));
 for(const seed of [12345,54321]){
  const normal=costumeFrameInput(ref,costumes.celery,true,'celery-face',false,'1K');
  const {resolution,...input}=normal;
  input.prompt=input.prompt.replace('Create a new coherent whole-person photograph','Create a tight head-and-shoulders ID portrait photograph').replace('Render the entire person naturally together.','Render the visible person naturally together.').replace(/General costume description:.*?TIGHT head-and-shoulders closeup:/,'Visible costume: shiny gray suit jacket collar over a light gray shirt and bolo tie. EXTREME CLOSE-UP: only the head, neck, collar and tops of shoulders are in frame. Crop both shoulders at the left and right edges. No arms, hands, belt or waist. TIGHT head-and-shoulders closeup:');
  const start=performance.now(),label=`${person}-portrait-refined-${seed}`;
  try{
   const response:any=await fal.run('google/nano-banana-lite/edit',{input:{...input,seed},abortSignal:AbortSignal.timeout(90000)});
   const requestMs=performance.now()-start,url=response.data.images[0].url,file=path.join(out,label+'.png');
   const download=await fetch(url);if(!download.ok)throw Error(`Image download: ${download.status}`);
   await fs.writeFile(file,Buffer.from(await download.arrayBuffer()));
   results.push({label,person,seed,requestMs,url,file,prompt:input.prompt});
  }catch(error){results.push({label,person,seed,requestMs:performance.now()-start,error:String(error)});}
  console.log(JSON.stringify({...results.at(-1),url:undefined,prompt:undefined}));
  await fs.writeFile(path.join(out,'portraits.json'),JSON.stringify(results,null,2));
 }
}
