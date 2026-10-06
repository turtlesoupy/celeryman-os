import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {interactiveVideo} from '../server/interactive-video.ts';
import {savedGeneration} from '../server/saved-generation.ts';
import {costumeFrameKey} from '../server/costume-frame.ts';
import {generationKey} from '../server/choreography.ts';
import {usesTextOnlyDance} from '../server/text-motion.ts';

const cwd=process.cwd(),scratch=await fs.mkdtemp(path.join(os.tmpdir(),'cinco-image-check-'));
const png=await fs.readFile('public/media/motion/celery.png');
const videoFixture=await fs.readFile('public/media/motion/celery-5s.mp4');
const original={run:fal.run,upload:fal.storage.upload,fetch:globalThis.fetch};
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
try{
 process.chdir(scratch);
 const media=path.join(scratch,'public/media');
 await fs.mkdir(path.join(media,'generated'),{recursive:true});await fs.mkdir(path.join(media,'motion'),{recursive:true});
 await fs.writeFile(path.join(media,'motion/hat-5s.mp4'),'fixture');
 await fs.writeFile(path.join(media,'motion/celery-5s.mp4'),'fixture');
 await fs.writeFile(path.join(media,'motion/celery-face-5s.mp4'),'fixture');
 globalThis.fetch=(async()=>new Response(png)) as typeof fetch;
 const motion=deferred<string>(),imageStarted=deferred<void>();let imageCalls=0,videoCalls=0;
 fal.storage.upload=async()=>motion.promise;
 fal.run=(async(model:string)=>{if(model.includes('nano-banana')){imageCalls++;imageStarted.resolve();return {requestId:'fixture-image',data:{images:[{url:'https://fixture/image.png'}]}};}videoCalls++;throw Error('Video reached');}) as typeof fal.run;
 const body={profile:'test',character:'celery',canonical:true,variant:'hat',costume:'gray suit',motion:'dance'};
 const job:any={};
 const work=interactiveVideo('a'.repeat(20),body,job,async()=> 'https://fixture/identity.png');
 const rejected=assert.rejects(work,/Video reached/);
 await Promise.race([imageStarted.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Image blocked on motion upload')),2000))]);
 assert.equal(videoCalls,0);motion.resolve('https://fixture/motion.mp4');await rejected;
 assert.equal(imageCalls,1);assert.equal(videoCalls,1);
 // The opt-in experiment skips both image synthesis and motion-reference upload.
 for(const profile of ['test','paul'])for(const canonical of [true,false])for(const variant of ['base','engaged','sway','flarhgunnstow','face','hat','intro','smile']){
  const before=videoCalls;
  fal.storage.upload=async()=>{throw Error('Fast path must not upload a motion clip');};
  fal.run=(async(model:string,options:any)=>{assert.equal(model,'minimax/h3-max/reference-to-video');assert.deepEqual(options.input.reference_image_urls,['https://fixture/identity.png']);assert(!options.input.reference_video_urls);assert(!options.input.image_url);assert(!options.input.prompt.includes('Video 1'));if(variant==='face'&&canonical){assert(options.input.prompt.includes('Solid hot pink'));assert(options.input.prompt.includes('never copy its clothing, scenery, pose or camera framing'));assert.equal(options.input.aspect_ratio,'4:3');}videoCalls++;throw Error('Video reached');}) as typeof fal.run;
  const request={...body,profile,variant,canonical};
  assert.equal(usesTextOnlyDance(request),false);
  assert.equal(usesTextOnlyDance({...request,fastPath:false}),false);
  assert.notEqual(generationKey(request),generationKey({...request,fastPath:true}));
  assert.equal(generationKey(request),generationKey({...request,fastPath:false}));
  await assert.rejects(interactiveVideo(profile+variant,{...request,fastPath:true},{},async()=> 'https://fixture/identity.png'),/Video reached/);assert.equal(videoCalls,before+1);
 }
 assert.equal(usesTextOnlyDance({fastPath:true}),true);
 // Turning the flag off keeps the portrait's existing image-then-video route.
 const controlCalls:string[]=[];
 fal.storage.upload=async()=> 'https://fixture/motion.mp4';
 fal.run=(async(model:string,options:any)=>{controlCalls.push(model);if(model.includes('nano-banana'))return {data:{images:[{url:'https://fixture/image.png'}]}};assert.equal(options.input.image_url,'https://fixture/image.png');throw Error('Control video reached');}) as typeof fal.run;
 await assert.rejects(interactiveVideo('control',{...body,variant:'face',fastPath:false},{},async()=> 'https://fixture/identity.png'),/Control video reached/);
 assert.deepEqual(controlCalls,['fal-ai/nano-banana-2/edit','minimax/h3-max-turbo/image-to-video']);
 videoCalls=1;
 fal.run=(async(model:string)=>{assert(model.includes('nano-banana'));imageCalls++;return {requestId:'fixture-image',data:{images:[{url:'https://fixture/image.png'}]}};}) as typeof fal.run;
 // Print directly from a generated smiling still; never invoke video synthesis.
 const printBody={...body,variant:'smile',canonical:false},printJob:any={};
 await interactiveVideo('b'.repeat(20),printBody,printJob,async()=> 'https://fixture/identity.png');
 assert.equal(videoCalls,1);assert.equal(imageCalls,2);assert.equal(printJob.status,'complete');
 assert.equal(printJob.image,'/media/generated/'+ 'b'.repeat(20)+'-print.png');
 assert.deepEqual(await fs.readFile(path.join(media,'generated','b'.repeat(20)+'-print.png')),png);
 assert.equal(await fs.access(path.join(media,'generated','b'.repeat(20)+'.mp4')).then(()=>true,()=>false),false);
 const restored=await savedGeneration(media,'b'.repeat(20));assert.equal(restored?.image,printJob.image);assert.equal(restored?.url,printJob.image);
 // A disk-cached smiling image needs neither an upload nor new inference.
 const cachedProfile='disk-cached',key=costumeFrameKey(cachedProfile,body.costume,true,'celery',true);
 await fs.writeFile(path.join(media,'generated',`identity-frame-${key}.png`),png);
 fal.storage.upload=async()=>{throw Error('Print must not upload a cached still');};
 await interactiveVideo('c'.repeat(20),{...printBody,profile:cachedProfile},{},async()=> 'https://fixture/identity.png');
 assert.equal(imageCalls,2);assert.equal(videoCalls,1);
 // The fast print path uses one direct video and extracts a real printable frame.
 const fastPrintCalls:string[]=[],fastPrintJob:any={},fastPrintId='e'.repeat(20);
 globalThis.fetch=(async()=>new Response(videoFixture)) as typeof fetch;
 fal.run=(async(model:string,options:any)=>{fastPrintCalls.push(model);assert.deepEqual(options.input.reference_image_urls,['https://fixture/identity.png']);assert(!options.input.reference_video_urls);assert.match(options.input.prompt,/smile from the very first frame/);return {requestId:'fast-print-video',data:{video:{url:'https://fixture/video.mp4'}}};}) as typeof fal.run;
 await interactiveVideo(fastPrintId,{...printBody,fastPath:true},fastPrintJob,async()=> 'https://fixture/identity.png');
 assert.deepEqual(fastPrintCalls,['minimax/h3-max/reference-to-video']);
 assert.equal(fastPrintJob.status,'complete');assert.equal(fastPrintJob.image,`/media/generated/${fastPrintId}.png`);
 const printBytes=await fs.readFile(path.join(media,'generated',fastPrintId+'.png'));
 assert.equal(printBytes.subarray(1,4).toString(),'PNG');
 assert.equal((await savedGeneration(media,fastPrintId))?.image,fastPrintJob.image);
 // Video cache recovery and invalid IDs still behave correctly.
 await fs.writeFile(path.join(media,'generated','d'.repeat(20)+'.mp4'),'video');
 assert.equal((await savedGeneration(media,'d'.repeat(20)))?.url,'/media/generated/'+ 'd'.repeat(20)+'.mp4');
 assert.equal(await savedGeneration(media,'../../bad'),undefined);
 console.log('Passed: direct dance routing without image/video references, all fast variants/profiles, control still-only printing, exact image preservation, disk cache without upload, and job recovery.');
}finally{
 fal.run=original.run;fal.storage.upload=original.upload;globalThis.fetch=original.fetch;
 process.chdir(cwd);await fs.rm(scratch,{recursive:true,force:true});
}
