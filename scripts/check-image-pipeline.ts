import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fal} from '@fal-ai/client';
import {interactiveVideo} from '../server/interactive-video.ts';
import {savedGeneration} from '../server/saved-generation.ts';
import {costumeFrameKey} from '../server/costume-frame.ts';

const cwd=process.cwd(),scratch=await fs.mkdtemp(path.join(os.tmpdir(),'cinco-image-check-'));
const png=await fs.readFile('public/media/motion/celery.png');
const original={run:fal.run,upload:fal.storage.upload,fetch:globalThis.fetch};
const deferred=<T>()=>{let resolve!:(value:T)=>void,reject!:(error:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
try{
 process.chdir(scratch);
 const media=path.join(scratch,'public/media');
 await fs.mkdir(path.join(media,'generated'),{recursive:true});await fs.mkdir(path.join(media,'motion'),{recursive:true});
 await fs.writeFile(path.join(media,'motion/celery-5s.mp4'),'fixture');
 globalThis.fetch=(async()=>new Response(png)) as typeof fetch;
 const motion=deferred<string>(),imageStarted=deferred<void>();let imageCalls=0,videoCalls=0;
 fal.storage.upload=async()=>motion.promise;
 fal.run=(async(model:string)=>{if(model.includes('nano-banana')){imageCalls++;imageStarted.resolve();return {requestId:'fixture-image',data:{images:[{url:'https://fixture/image.png'}]}};}videoCalls++;throw Error('Video reached');}) as typeof fal.run;
 const body={profile:'test',character:'celery',canonical:true,variant:'base',costume:'gray suit',motion:'dance'};
 const job:any={};
 const work=interactiveVideo('a'.repeat(20),body,job,async()=> 'https://fixture/identity.png');
 const rejected=assert.rejects(work,/Video reached/);
 await Promise.race([imageStarted.promise,new Promise((_,reject)=>setTimeout(()=>reject(Error('Image blocked on motion upload')),2000))]);
 assert.equal(videoCalls,0);motion.resolve('https://fixture/motion.mp4');await rejected;
 assert.equal(imageCalls,1);assert.equal(videoCalls,1);
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
 // Video cache recovery and invalid IDs still behave correctly.
 await fs.writeFile(path.join(media,'generated','d'.repeat(20)+'.mp4'),'video');
 assert.equal((await savedGeneration(media,'d'.repeat(20)))?.url,'/media/generated/'+ 'd'.repeat(20)+'.mp4');
 assert.equal(await savedGeneration(media,'../../bad'),undefined);
 console.log('Passed: image/motion overlap, still-only printing, exact image preservation, disk cache without upload, and job recovery.');
}finally{
 fal.run=original.run;fal.storage.upload=original.upload;globalThis.fetch=original.fetch;
 process.chdir(cwd);await fs.rm(scratch,{recursive:true,force:true});
}
