import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const archive='analysis/text-motion-eval-20261005',dir='public/text-motion-eval';
const read=async(p:string)=>JSON.parse(await fs.readFile(p,'utf8'));
const [plan,records,data,key]=await Promise.all([read(`${archive}/plan.json`),read(`${archive}/requests.json`),read(`${dir}/rounds.json`),read(`${archive}/key.json`)]);
assert.equal(plan.people.length,3);assert.equal(data.id,plan.id);assert.equal(key.id,plan.id);
assert.equal(data.rounds.length,24);assert.equal(key.key.length,24);
const good=records.filter((r:any)=>!r.error),images=good.filter((r:any)=>r.kind==='image'),videos=good.filter((r:any)=>r.kind==='video');
assert.equal(images.length,18);assert.equal(videos.length,48);assert.equal(new Set(good.map((r:any)=>r.fingerprint)).size,66);
for(const s of good){
 const bytes=await fs.readFile(`${dir}/assets/${s.file}`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),s.sha256);assert.deepEqual(bytes,await fs.readFile(`${archive}/${s.file}`));
 for(const field of ['reference_video_urls','video_url','image_url'])assert(!(field in s.input),'No video or initial-frame constraint');
 assert(records.filter((r:any)=>r.fingerprint===s.fingerprint).length<=2);
 if(s.kind==='video'){assert.equal(s.input.resolution,'480P');assert(Number(s.duration)>=4.9);}
 else assert.equal(s.input.resolution,'0.5K');
}
for(const person of plan.people){
 assert.equal(plan.rounds.filter((r:any)=>r.person===person.id).length,8);
 assert.equal(plan.rounds.filter((r:any)=>r.person===person.id&&r.anchorOnA).length,4);
 const bytes=await fs.readFile(`${archive}/${person.id}-reference.jpg`),digest=createHash('sha256').update(bytes).digest('hex');
 for(const s of videos.filter((r:any)=>r.person===person.id))assert.equal(s.input.reference_image_urls[0],digest);
}
const cells=new Set<string>();
for(const round of data.rounds){
 const k=key.key.find((r:any)=>r.id===round.id),p=plan.rounds.find((r:any)=>r.id===round.id);assert(k&&p);
 assert(!cells.has(k.caseId));cells.add(k.caseId);
 assert.equal(k.A.variant==='anchored',p.anchorOnA);
 for(const field of ['caseId','variant','requestMs','model','seed','take'])assert(!(field in round));
 const a=k.A,b=k.B;assert.equal(a.model,b.model);assert.equal(a.width,b.width);assert.equal(a.height,b.height);
 assert.deepEqual({...a.input,reference_image_urls:null},{...b.input,reference_image_urls:null});
 const anchored=[a,b].find(s=>s.variant==='anchored'),direct=[a,b].find(s=>s.variant==='direct');assert(anchored&&direct);
 assert.equal(direct.input.reference_image_urls.length,1);assert.equal(anchored.input.reference_image_urls.length,2);
 assert.equal(direct.input.reference_image_urls[0],anchored.input.reference_image_urls[0]);
 const anchor=images.find((r:any)=>r.caseId===anchored.anchorCase);assert(anchor);
 assert.equal(anchored.input.reference_image_urls[1],anchor.sha256);
 assert.equal(anchored.coldRequestSumMs,anchor.requestMs+anchored.requestMs);assert.equal(direct.coldRequestSumMs,direct.requestMs);
 for(const side of ['A','B'])assert.equal(round[side],`assets/${k[side].file}`);
 assert(round.motion&&round.motionText,'Reviewer gets both dance target and exact requested text');
}
for(const p of plan.people)for(const character of ['celery','oyster','tayne','flarhgunnstow'])for(const take of [1,2])assert(cells.has(`${p.id}-${character}-${take}`));
await fs.writeFile(`${archive}/contract-verification.json`,JSON.stringify({passed:true,sourcePhotos:3,dances:4,takesPerCase:2,pairs:24,images:18,videos:48,noProviderVideoInputs:true,onlyExtraCostumeReferenceVaries:true,blindMappingVerified:true,mediaHashesVerified:true,failedAttempts:records.filter((r:any)=>r.error).length},null,2));
console.log('Verified 24 paired comparisons, all 66 media hashes, matched settings, and zero provider video inputs.');
