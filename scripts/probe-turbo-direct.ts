import 'dotenv/config';
import fs from 'node:fs/promises';
import {fal} from '@fal-ai/client';
import {costumes,motions} from '../src/dances.ts';
import {textMotionPrompt} from '../server/text-motion.ts';
const dir='public/turbo-direct-test';await fs.mkdir(dir,{recursive:true});
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const people=[['thomas','reference/thomas-dimson.jpg'],['upload','analysis/optimization-20261005/identity-upload.jpg']];
const records:any[]=[];
for(const [person,file] of people){
 const bytes=await fs.readFile(file);await fs.writeFile(`${dir}/${person}.jpg`,bytes);
 const url=await fal.storage.upload(new File([bytes],'identity.jpg',{type:'image/jpeg'}));
 for(const arm of person==='thomas'?['turbo','current']:['current','turbo']){
 const model=arm==='turbo'?'minimax/h3-max-turbo/image-to-video':'minimax/h3-max/reference-to-video';
 const input={...(arm==='turbo'?{image_url:url}:{reference_image_urls:[url],aspect_ratio:'9:16'}),prompt:textMotionPrompt(costumes.celery,motions.celery,false),duration:5,resolution:'480P',prompt_expansion_mode:'disabled',seed:71931};
 const start=performance.now();console.log('Starting',person,arm);
 try{const result:any=await fal.run(model,{input,abortSignal:AbortSignal.timeout(120000)});const requestMs=performance.now()-start;
 const response=await fetch(result.data.video.url);if(!response.ok)throw Error('download '+response.status);await fs.writeFile(`${dir}/${person}-${arm}.mp4`,Buffer.from(await response.arrayBuffer()));
 records.push({person,arm,model,requestMs,totalMs:performance.now()-start,requestId:result.requestId,input});console.log('Complete',person,arm,Math.round(requestMs));
 }catch(e){records.push({person,arm,error:String(e),totalMs:performance.now()-start});console.log('Failed',person,arm,String(e));}
 await fs.writeFile(`${dir}/results.json`,JSON.stringify(records,null,2));
 }
}
