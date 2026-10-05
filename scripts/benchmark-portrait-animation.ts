import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fal} from '@fal-ai/client';

fal.config({credentials:process.env.FAL_KEY});
const out=path.resolve('analysis/optimization-20261005');
const baseline=JSON.parse(await fs.readFile(path.join(out,'images.json'),'utf8'));
const refined=JSON.parse(await fs.readFile(path.join(out,'portraits.json'),'utf8'));
const results:any[]=[];
for(const person of ['thomas','upload']){
 const pair=[baseline.find((r:any)=>r.person===person&&r.closeup&&r.model==='fal-ai/nano-banana-2/edit'),refined.find((r:any)=>r.person===person&&r.seed===12345)];
 for(const [index,frame]of pair.entries()){
  if(!frame?.url)throw Error('Run both image benchmark scripts first');
  const variant=index?'lite-refined':'baseline',start=performance.now();
  try{
   const response:any=await fal.run('minimax/h3-max-turbo/image-to-video',{input:{image_url:frame.url,prompt:'Animate this exact head-and-shoulders portrait. Keep the camera fixed at this exact close-up scale, with the same face, clothing and accessories. Preserve the presence or absence of eyeglasses and headwear exactly. Tiny rhythmic head bobs and glances, subtle awkward smile. Solid hot pink background. No zoom, no cuts, no speech. Keep the upper chest at the bottom edge; do not show the waist, legs or feet. End in the initial pose for a seamless loop.',duration:5,resolution:'480P',aspect_ratio:'4:3',prompt_expansion_mode:'disabled',seed:54321},abortSignal:AbortSignal.timeout(90000)});
   const requestMs=performance.now()-start,file=path.join(out,`${person}-portrait-${variant}.mp4`);
   const download=await fetch(response.data.video.url);if(!download.ok)throw Error(`Video download: ${download.status}`);
   await fs.writeFile(file,Buffer.from(await download.arrayBuffer()));
   results.push({person,variant,requestMs,file,frameRequestMs:frame.requestMs,requestId:response.requestId});
  }catch(error){results.push({person,variant,requestMs:performance.now()-start,error:String(error)});}
  console.log(JSON.stringify(results.at(-1)));await fs.writeFile(path.join(out,'portrait-videos.json'),JSON.stringify(results,null,2));
 }
}
