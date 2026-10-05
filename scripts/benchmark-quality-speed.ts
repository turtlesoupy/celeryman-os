import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes} from '../src/dances.ts';
fal.config({credentials:process.env.FAL_KEY});
const upload=process.argv[2];if(!upload)throw Error('Usage: tsx scripts/benchmark-quality-speed.ts /path/to/regression-photo.jpg');
const out=path.resolve('analysis/optimization-20261005');await fs.mkdir(out,{recursive:true});
const sources={thomas:'reference/thomas-dimson.jpg',upload};
const refs:Record<string,string>={};
for(const [person,file] of Object.entries(sources))refs[person]=await fal.storage.upload(new File([await fs.readFile(file)],person+'.jpg',{type:'image/jpeg'}));
const cases=[{person:'thomas',character:'celery',closeup:false},{person:'upload',character:'celery',closeup:false},{person:'thomas',character:'celery',closeup:true},{person:'upload',character:'celery',closeup:true},{person:'upload',character:'oyster',closeup:false},{person:'thomas',character:'tayne',closeup:false}];
const models=['fal-ai/nano-banana-2/edit','google/nano-banana-lite/edit'];
const results:any[]=[];
for(const [index,test] of cases.entries()){
 const rows=await Promise.allSettled(models.map(async(model,mi)=>{
  const canonical=test.character+(test.closeup?'-face':'');
  const normal=costumeFrameInput(refs[test.person],costumes[test.character],test.closeup,canonical,false,test.closeup?'1K':'0.5K');
  const {resolution,...lite}=normal;const input=model.includes('lite')?lite:normal;
  const label=`${index}-${test.person}-${test.character}-${test.closeup?'portrait':'body'}-${mi?'lite':'baseline'}`,file=path.join(out,label+'.png');
  const start=performance.now();
  try{
   const result:any=await fal.run(model,{input,abortSignal:AbortSignal.timeout(90000)});const requestMs=performance.now()-start;
   const download=performance.now(),response=await fetch(result.data.images[0].url);if(!response.ok)throw Error('Download failed');await fs.writeFile(file,Buffer.from(await response.arrayBuffer()));
   return {label,...test,model,requestMs,downloadMs:performance.now()-download,file,url:result.data.images[0].url,requestId:result.requestId,prompt:input.prompt,resolution:model.includes('lite')?'fixed 1K':resolution};
  }catch(e){return {label,...test,model,error:(e as Error).message,requestMs:performance.now()-start};}
 }));
 for(const r of rows){if(r.status==='rejected')throw r.reason;results.push(r.value);console.log(JSON.stringify({...r.value,prompt:undefined,url:undefined,file:path.basename('file' in r.value?r.value.file:'')}));}
 await fs.writeFile(path.join(out,'images.json'),JSON.stringify(results,null,2));
}
