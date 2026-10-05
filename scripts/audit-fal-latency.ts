import 'dotenv/config';
import fs from 'node:fs/promises';import path from 'node:path';import {fal} from '@fal-ai/client';
const out=path.resolve('analysis/optimization-20261005');
const upload=process.argv[2];if(!upload)throw Error('Usage: tsx scripts/audit-fal-latency.ts /path/to/regression-photo.jpg');
fal.config({credentials:process.env.FAL_KEY});
const portraits=JSON.parse(await fs.readFile(path.join(out,'portraits.json'),'utf8'));
const frame=portraits.find((r:any)=>r.person==='thomas'&&r.seed===12345);
const results:any[]=[];
async function request(model:string,input:Record<string,unknown>,label:string,kind:'image'|'video',meta:Record<string,unknown>={}){
 const start=performance.now();
 try{
  // Exactly one raw HTTP request: no SDK transformation, polling or retries.
  const response=await fetch(`https://fal.run/${model}`,{method:'POST',headers:{Authorization:`Key ${process.env.FAL_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(90000)});
  const headersMs=performance.now()-start,data:any=await response.json(),requestMs=performance.now()-start;
  if(!response.ok)throw Error(`HTTP ${response.status}: ${JSON.stringify(data).slice(0,800)}`);
  const media=kind==='video'?data.video:data.images?.[0];if(!media?.url)throw Error('No output URL');
  const ext=kind==='video'?'mp4':input.output_format==='jpeg'?'jpg':'png';
  const file=path.join(out,label+'.'+ext),downloadStart=performance.now(),download=await fetch(media.url,{signal:AbortSignal.timeout(30000)});
  if(!download.ok)throw Error(`Download HTTP ${download.status}`);const bytes=Buffer.from(await download.arrayBuffer());await fs.writeFile(file,bytes);
  const timingHeaders=Object.fromEntries([...response.headers].filter(([key])=>/^(server-timing|x-fal-.*(?:time|region)|x-request-id|x-fal-request-id)$/.test(key)));
  results.push({label,kind,model,...meta,requestMs,headersMs,downloadMs:performance.now()-downloadStart,bytes:bytes.length,providerTimings:data.timings,timingHeaders,file});
 }catch(error){results.push({label,kind,model,...meta,requestMs:performance.now()-start,error:String(error)});}
 console.log(JSON.stringify(results.at(-1)));await fs.writeFile(path.join(out,'latency-audit.json'),JSON.stringify(results,null,2));
}
const videoInput={image_url:frame.url,prompt:'Animate this exact head-and-shoulders portrait. Keep the camera fixed at this exact close-up scale, with the same face, clothing and accessories. Preserve the presence or absence of eyeglasses and headwear exactly. Tiny rhythmic head bobs and glances, subtle awkward smile. Solid hot pink background. No zoom, no cuts, no speech. Keep the upper chest at the bottom edge; do not show the waist, legs or feet. End in the initial pose for a seamless loop.',duration:5,resolution:'480P',prompt_expansion_mode:'disabled',seed:54321};
for(const [i,variant]of ['turbo','max','max','turbo'].entries())await request(`minimax/h3-max${variant==='turbo'?'-turbo':''}/image-to-video`,videoInput,`audit-video-${i}-${variant}`,'video',{variant,transport:'raw-http'});
// Queue API control: shows time until in-progress and result; status observations
// are polling timestamps, not exact server scheduling timestamps.
{
 const updates:any[]=[],start=performance.now();try{
 const response:any=await fal.subscribe('minimax/h3-max-turbo/image-to-video',{input:videoInput,onQueueUpdate:state=>updates.push({status:state.status,observedMs:performance.now()-start}),abortSignal:AbortSignal.timeout(90000)});
 const requestMs=performance.now()-start,file=path.join(out,'audit-video-queue-turbo.mp4'),download=await fetch(response.data.video.url);if(!download.ok)throw Error(`Download HTTP ${download.status}`);await fs.writeFile(file,Buffer.from(await download.arrayBuffer()));
 results.push({label:'audit-video-queue-turbo',kind:'video',model:'minimax/h3-max-turbo/image-to-video',transport:'sdk-queue',requestMs,updates,providerTimings:response.data.timings,file});
 }catch(error){results.push({label:'audit-video-queue-turbo',kind:'video',transport:'sdk-queue',requestMs:performance.now()-start,updates,error:String(error)});}
 console.log(JSON.stringify(results.at(-1)));await fs.writeFile(path.join(out,'latency-audit.json'),JSON.stringify(results,null,2));
}
for(const [person,photo]of Object.entries({thomas:'reference/thomas-dimson.jpg',upload})){
 const ref=await fal.storage.upload(new File([await fs.readFile(photo)],'identity.jpg',{type:'image/jpeg'}));
 const prompt=portraits.find((r:any)=>r.person===person&&r.seed===12345).prompt;
 // Same portrait-specific prompt for both models, unlike the first exploratory
 // round. JPEG is a separate transport/encoding candidate, never silently used.
 for(const variant of person==='thomas'?['baseline','lite','lite-jpeg']:['lite-jpeg','lite','baseline']){
  const model=variant==='baseline'?'fal-ai/nano-banana-2/edit':'google/nano-banana-lite/edit';
  await request(model,{image_urls:[ref],prompt,aspect_ratio:'4:3',num_images:1,output_format:variant==='lite-jpeg'?'jpeg':'png',seed:54321,...(variant==='baseline'?{resolution:'1K'}:{})},`audit-image-${person}-${variant}`,'image',{person,variant,transport:'raw-http',outputFormat:variant==='lite-jpeg'?'jpeg':'png'});
 }
}
// Repeat via the production SDK path in the same session; raw HTTP alone
// cannot distinguish a transport effect from a change in provider load.
for(const variant of ['turbo','max']){
 const start=performance.now(),model=`minimax/h3-max${variant==='turbo'?'-turbo':''}/image-to-video`,label=`audit-video-sdk-${variant}`;
 try{const response:any=await fal.run(model,{input:videoInput,abortSignal:AbortSignal.timeout(90000)});const requestMs=performance.now()-start,file=path.join(out,label+'.mp4');const download=await fetch(response.data.video.url);if(!download.ok)throw Error(`Download HTTP ${download.status}`);await fs.writeFile(file,Buffer.from(await download.arrayBuffer()));results.push({label,kind:'video',model,transport:'sdk-run',requestMs,providerTimings:response.data.timings,file});}catch(error){results.push({label,kind:'video',model,transport:'sdk-run',requestMs:performance.now()-start,error:String(error)});}
 console.log(JSON.stringify(results.at(-1)));await fs.writeFile(path.join(out,'latency-audit.json'),JSON.stringify(results,null,2));
}
