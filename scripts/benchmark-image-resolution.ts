import 'dotenv/config';
import fs from 'node:fs/promises';
import {fal} from '@fal-ai/client';
import {costumeFrameInput} from '../server/costume-frame.ts';
import {costumes} from '../src/dances.ts';

const directory='analysis/image-resolution-20261005';
await fs.mkdir(directory,{recursive:true});
fal.config({credentials:process.env.FAL_KEY});
const ref=await fal.storage.upload(new File([await fs.readFile('reference/thomas-dimson.jpg')],'identity.jpg',{type:'image/jpeg'}));
const results:any[]=[];
// Same current production prompt/model; alternating order, two seeds. No change
// to production defaults. A seed does not ensure equivalent random outputs.
for(const [i,seed] of [78231,78232].entries())for(const resolution of (i?['0.5K','1K']:['1K','0.5K']) as ('0.5K'|'1K')[]){
 const start=performance.now();
 try{
  const response:any=await fal.run('fal-ai/nano-banana-2/edit',{input:{...costumeFrameInput(ref,costumes.celery,true,'celery-face',false,resolution),seed},abortSignal:AbortSignal.timeout(60000)});
  const requestMs=performance.now()-start,file=`${seed}-${resolution}.png`;
  const downloaded=await fetch(response.data.images[0].url,{signal:AbortSignal.timeout(20000)});if(!downloaded.ok)throw Error('Image download failed');const bytes=Buffer.from(await downloaded.arrayBuffer());
  await fs.writeFile(`${directory}/${file}`,bytes);
  results.push({seed,resolution,requestMs,completeMs:performance.now()-start,bytes:bytes.length,file,requestId:response.requestId});
 }catch(error){results.push({seed,resolution,error:String(error),completeMs:performance.now()-start});}
 await fs.writeFile(`${directory}/results.json`,JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.at(-1)));
}
