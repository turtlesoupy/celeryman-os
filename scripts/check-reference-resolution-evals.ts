import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const name=process.argv[2];
assert(['resolution','reference'].includes(name));
const dir=`public/${name}-eval`,archive=`analysis/${name}-eval-20261005`;
const read=async(path:string)=>JSON.parse(await fs.readFile(path,'utf8'));
const [plan,data,reveal,records]=await Promise.all(['plan.json','../../'+dir+'/rounds.json','../../'+dir+'/reveal.json','requests.json'].map(file=>read(`${archive}/${file}`)));
const resolution=name==='resolution',success=records.filter((r:any)=>!r.error);
assert.equal(success.length,resolution?32:8);assert.equal(data.rounds.length,resolution?16:4);
assert.equal(data.id,plan.id);assert.equal(reveal.id,plan.id);assert.equal(reveal.key.length,data.rounds.length);
assert.equal(new Set(success.map((r:any)=>r.fingerprint)).size,success.length);
for(const row of success){
 const bytes=await fs.readFile(`${dir}/assets/${row.file}`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.deepEqual(bytes,await fs.readFile(`${archive}/${row.file}`));
 if(row.kind==='video')assert(Number(row.duration)>=4.9);
 assert(records.filter((r:any)=>r.fingerprint===row.fingerprint).length<=2);
}
for(const round of data.rounds){
 for(const forbidden of ['variant','model','requestMs','seed','take','caseId'])assert(!(forbidden in round));
 const key=reveal.key.find((k:any)=>k.id===round.id),p=plan.rounds.find((r:any)=>r.id===round.id);assert(key&&p);
 for(const side of ['A','B'])assert.equal(round[side],`assets/${key[side].file}`);
 const {A:a,B:b}=key;
 assert.equal(a.model,b.model);assert.equal(a.input.prompt,b.input.prompt);assert.equal(a.input.seed,b.input.seed);
 if(resolution){
  assert.equal(a.variant.startsWith('full'),p.baselineOnA);
  if(round.kind==='image'){
   assert.deepEqual({...a.input,resolution:null},{...b.input,resolution:null});
   assert.deepEqual([a.input.resolution,b.input.resolution].sort(),['0.5K','1K']);
  }else{
   const omitAnchor=(s:any)=>({...s.input,image_url:undefined,reference_image_urls:s.input.reference_image_urls?.slice(1)});
   assert.deepEqual(omitAnchor(a),omitAnchor(b));
   assert.equal(a.width,b.width);assert.equal(a.height,b.height);
   for(const s of [a,b]){
    const anchor=success.find((r:any)=>r.caseId===key.caseId&&r.variant===s.anchorVariant);assert(anchor);
    assert.equal(s.input.image_url||s.input.reference_image_urls[0],anchor.sha256);
    assert.equal(s.coldRequestSumMs,s.requestMs+anchor.requestMs);
   }
  }
 }else{
  assert.equal(a.motionReference,p.motionOnA);assert.equal(a.anchored,b.anchored);assert.equal(a.anchored,p.anchored);
  assert.deepEqual({...a.input,reference_video_urls:null},{...b.input,reference_video_urls:null});
  assert.notEqual(a.motionReference,b.motionReference);
  for(const s of [a,b]){
   assert.equal(s.input.reference_image_urls.length,s.anchored?2:1);
   assert.equal(!!s.input.reference_video_urls,s.motionReference);
   assert.equal(s.coldRequestSumMs,s.requestMs+s.anchorRequestMs);
  }
 }
}
if(resolution){
 for(const kind of ['image','video'])assert.equal(plan.rounds.filter((r:any)=>r.kind===kind&&r.baselineOnA).length,4);
}else{
 assert.equal(plan.rounds.filter((r:any)=>r.motionOnA).length,2);
 for(const take of [1,2]){
  const rows=success.filter((r:any)=>r.take===take);assert.equal(rows.length,4);
  const omit=(s:any)=>({...s.input,reference_image_urls:null,reference_video_urls:null});
  for(const row of rows)assert.deepEqual(omit(row),omit(rows[0]));
  assert.equal(new Set(rows.map((r:any)=>r.input.reference_image_urls.at(-1))).size,1);
  assert.equal(new Set(rows.filter((r:any)=>r.anchored).map((r:any)=>r.input.reference_image_urls[0])).size,1);
 }
}
await fs.writeFile(`${archive}/contract-verification.json`,JSON.stringify({passed:true,outputs:success.length,pairs:data.rounds.length,failedAttempts:records.filter((r:any)=>r.error).length,assetHashesVerified:true,inputParityVerified:true,blindMappingVerified:true,coldCostVerified:true},null,2));
console.log(`${name}: verified ${success.length} outputs and ${data.rounds.length} blind pairs.`);
