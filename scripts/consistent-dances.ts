import 'dotenv/config';import fs from 'node:fs/promises';import {fal} from '@fal-ai/client';import {finishChoreography,motionPrompt} from '../server/choreography';
fal.config({credentials:process.env.FAL_KEY});
const outcomes=await Promise.allSettled([['engaged','b494a0dba7c800985e67'],['flarhgunnstow','fe2abc5c2be18cd83d48']].map(async([name,id])=>{
 const image=await fal.storage.upload(new File([await fs.readFile(`public/media/generated/${id}.png`)],'entire-person.png',{type:'image/png'}));
 const ref=`public/media/motion/${name}-5s.mp4`,motion=await fal.storage.upload(new File([await fs.readFile(ref)],'choreography.mp4',{type:'video/mp4'}));
 const input={reference_image_urls:[image],reference_video_urls:[motion],prompt:motionPrompt(name)+' Preserve the exact same entire outfit, neckline, tie and fabric pattern from Image 1. Background pure flat white. Every pose and timing follows Video 1 precisely.',duration:5,resolution:'480P',aspect_ratio:'9:16',prompt_expansion_mode:'disabled'};
 const model='minimax/h3-max/reference-to-video';const r=await fal.subscribe(model,{input});const file=`analysis/${name}-consistent.mp4`;await fs.writeFile(file,Buffer.from(await(await fetch(r.data.video.url)).arrayBuffer()));await fs.writeFile(file+'.json',JSON.stringify({model,input,requestId:r.requestId},null,2));await finishChoreography(file,ref,`analysis/${name}-consistent-finished.mp4`,name);console.log(name,r.requestId);
}));

for(const outcome of outcomes)if(outcome.status==='rejected')console.error(outcome.reason?.body||outcome.reason?.message||outcome.reason);
