import 'dotenv/config';
import fs from 'node:fs/promises';
import {fal} from '@fal-ai/client';
import {costumes} from '../src/dances.ts';
import {textMotionPrompt,smilePortraitPrompt} from '../server/text-motion.ts';

// A/B of the fast-path portrait (face) and print (smile) prompts on the reference
// model. "before" is the pre-change wording verbatim; "fix" is the current server prompt.
// An earlier "after" arm (explicit eye-line/crop wording) tested worse and was dropped.
const arms=(process.env.ARMS||'before,fix').split(',');
const dir='benchmarks/portrait-framing-20261006';await fs.mkdir(dir,{recursive:true});
fal.config({credentials:process.env.FAL_KEY,retry:{maxRetries:0}});
const people=[['thomas','reference/thomas-dimson.jpg'],['upload','analysis/optimization-20261005/identity-upload.jpg'],['paul','reference/paul-rudd.png']];
const oldSmile=(costume:string)=>`Image 1 supplies only the identity of the adult performer. Preserve their recognizable face, hair, facial hair and eyewear unless the outfit explicitly replaces it. Ignore the reference clothing, pose and scenery. Dress in ${costume}. Tight head-and-shoulders studio portrait, full head and hat visible, shoulders and upper chest in frame. Look at the camera and hold a broad closed-mouth smile from the very first frame through the entire clip. Uniform pale gray empty background. Locked camera. Exactly one person. No props, background figures, text, cuts, speech or music.`;
const oldFace=(costume:string)=>`Generate the SAME recognizable adult person depicted in Image 1, the original identity photograph. Preserve facial proportions, hair, age appearance, and presence or absence of facial hair and eyeglasses, except eyewear or headwear explicitly specified by the costume. Image 1 supplies identity only: never copy its clothing, scenery, pose or camera framing. Dress the person in this outfit: ${costume}. Reframe as a tight head-and-shoulders portrait, with the entire head and any hat visible with a small margin above, shoulders and upper chest filling the bottom edge. Never show the waist, legs or feet. Solid hot pink studio background, edge to edge. Locked static camera with no zoom. Flat 1990s low-budget desktop footage. Small rhythmic head bobs and glances, subtle awkward smile. Exactly one coherent person, no pasted head, collage, other people, text, cuts or speech. End in the starting pose for a seamless five-second loop.`;
function prompt(variant:string,arm:string){
 if(variant==='smile')return arm==='fix'?smilePortraitPrompt(costumes.celery):oldSmile(costumes.celery);
 return arm==='fix'?textMotionPrompt(costumes.celery,'',true):oldFace(costumes.celery);
}
const jobs:{person:string,url:string,variant:string,arm:string}[]=[];
for(const [person,file] of people){
 const bytes=await fs.readFile(file);
 const url=await fal.storage.upload(new File([bytes],'identity'+file.slice(file.lastIndexOf('.')),{type:file.endsWith('.png')?'image/png':'image/jpeg'}));
 for(const variant of ['face','smile'])for(const arm of arms)jobs.push({person,url,variant,arm});
}
const records:any[]=[];
async function run(j:typeof jobs[number]){
 const input={reference_image_urls:[j.url],prompt:prompt(j.variant,j.arm),duration:5,resolution:'480P',aspect_ratio:'4:3',prompt_expansion_mode:'disabled',seed:71931};
 const name=`${j.person}-${j.variant}-${j.arm}`,start=performance.now();console.log('Starting',name);
 try{
  const result:any=await fal.run('minimax/h3-max/reference-to-video',{input,abortSignal:AbortSignal.timeout(170000)});
  const response=await fetch(result.data.video.url);if(!response.ok)throw Error('download '+response.status);
  await fs.writeFile(`${dir}/${name}.mp4`,Buffer.from(await response.arrayBuffer()));
  records.push({...j,url:undefined,name,requestId:result.requestId,ms:Math.round(performance.now()-start),prompt:input.prompt});console.log('Complete',name);
 }catch(e){records.push({...j,url:undefined,name,error:String(e)});console.log('Failed',name,String(e));}
}
const queue=[...jobs];
await Promise.all(Array.from({length:4},async()=>{while(queue.length)await run(queue.shift()!);}));
await fs.writeFile(`${dir}/results.json`,JSON.stringify(records,null,2));
