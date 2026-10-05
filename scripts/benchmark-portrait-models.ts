import 'dotenv/config';
import fs from 'node:fs/promises';import path from 'node:path';import {fal} from '@fal-ai/client';
const out=path.resolve('analysis/optimization-20261005');
const rows=JSON.parse(await fs.readFile(path.join(out,'portraits.json'),'utf8'));
const frame=rows.find((r:any)=>r.person==='thomas'&&r.seed===12345);
if(!frame?.url)throw Error('Run the Lite portrait benchmark first');
const results:any[]=[];let attempts:any[]=[];
fal.config({credentials:process.env.FAL_KEY,fetch:async(input,init)=>{const start=performance.now();try{const response=await fetch(input,init);attempts.push({status:response.status,headersMs:performance.now()-start});return response;}catch(error){attempts.push({error:String(error),requestMs:performance.now()-start});throw error;}}});
for(const variant of ['max','turbo','turbo','max']){
 attempts=[];const start=performance.now(),model=`minimax/h3-max${variant==='turbo'?'-turbo':''}/image-to-video`;
 try{
  const response:any=await fal.run(model,{input:{image_url:frame.url,prompt:'Animate this exact head-and-shoulders portrait. Keep the camera fixed at this exact close-up scale, with the same face, clothing and accessories. Preserve the presence or absence of eyeglasses and headwear exactly. Tiny rhythmic head bobs and glances, subtle awkward smile. Solid hot pink background. No zoom, no cuts, no speech. Keep the upper chest at the bottom edge; do not show the waist, legs or feet. End in the initial pose for a seamless loop.',duration:5,resolution:'480P',prompt_expansion_mode:'disabled',seed:54321},abortSignal:AbortSignal.timeout(90000)});
  const requestMs=performance.now()-start,file=path.join(out,`portrait-model-${results.length}-${variant}.mp4`);
  const download=await fetch(response.data.video.url);if(!download.ok)throw Error(`Video download: ${download.status}`);await fs.writeFile(file,Buffer.from(await download.arrayBuffer()));
  results.push({variant,model,requestMs,providerTimings:response.data.timings,attempts,file});
 }catch(error){results.push({variant,model,requestMs:performance.now()-start,attempts,error:String(error),status:(error as any)?.status});}
 console.log(JSON.stringify(results.at(-1)));await fs.writeFile(path.join(out,'portrait-models.json'),JSON.stringify(results,null,2));
}
