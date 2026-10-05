import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {costumes, motions} from '../src/dances.ts';

// Generates fresh media for visual identity review. API success alone is not
// an identity score: inspect the returned portrait and video frames separately.
const photo=process.argv[2];
if(!photo)throw Error('Usage: node --import tsx scripts/check-uploaded-identity.ts /path/to/photo.jpg');
const site=process.env.IDENTITY_SITE||'http://127.0.0.1:5173';
const request=async(endpoint:string,body?:unknown)=>{
 const response=await fetch(site+'/api/'+endpoint,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Origin:site},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});
 const value=await response.json();assert.ok(response.ok,value.error);return value;
};
const {id:profile}=await request('profile',{image:(await fs.readFile(photo)).toString('base64')});
const results=[];
for(const [character,variant] of [['celery','base'],['celery','face'],['oyster','base'],['tayne','intro']]){
 const start=performance.now();
 let job=await request('generate',{profile,character,variant,canonical:true,costume:costumes[character!],motion:variant==='base'?motions[character!]:motions[variant!]});
 while(job.status==='working'){
  assert.ok(performance.now()-start<180000,'Generation timed out');
  await new Promise(resolve=>setTimeout(resolve,300));job=await request('job/'+job.id);
 }
 assert.equal(job.status,'complete',job.error);
 const metadata=await(await fetch(site+job.url.replace('.mp4','.json'))).json();
 assert.equal(metadata.profile,profile,'Generation used another identity');
 assert.equal(metadata.pipeline,'identity-only-costume-v2','Old generation pipeline');
 results.push({character,variant,id:job.id,video:site+job.url,poster:site+job.image,timings:metadata.timings,model:metadata.model,costumeFrame:metadata.costumeFrame});
 console.log(JSON.stringify(results.at(-1)));
}
const output=process.env.IDENTITY_REPORT||'/tmp/celeryman-uploaded-identity.json';
await fs.writeFile(output,JSON.stringify({created:new Date().toISOString(),site,profile,visualReviewRequired:true,results},null,2)+'\n');
console.log('Review generated media; report saved to '+output);
