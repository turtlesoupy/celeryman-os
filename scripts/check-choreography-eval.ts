import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const archive='analysis/choreography-eval-20261005',dir='public/choreography-eval';
const read=async(p:string)=>JSON.parse(await fs.readFile(p,'utf8'));
const [plan,records,data,key,source]=await Promise.all([read(`${archive}/plan.json`),read(`${archive}/requests.json`),read(`${dir}/rounds.json`),read(`${archive}/key.json`),read('analysis/resolution-eval-20261005/requests.json')]);
assert.equal(data.id,plan.id);assert.equal(key.id,plan.id);assert.equal(data.rounds.length,4);assert.equal(key.key.length,4);
const successful=records.filter((r:any)=>!r.error);assert.equal(successful.length,8);
assert.equal(new Set(successful.map((r:any)=>r.fingerprint)).size,8);
assert.equal(plan.rounds.filter((r:any)=>r.baselineOnA).length,2);
for(const round of data.rounds){
 const k=key.key.find((r:any)=>r.id===round.id),p=plan.rounds.find((r:any)=>r.id===round.id);assert(k&&p);
 assert.equal(k.A.variant==='current',p.baselineOnA);
 for(const field of ['caseId','variant','requestMs','take','seed','model'])assert(!(field in round));
 const [a,b]=[k.A,k.B];assert.equal(a.model,b.model);
 assert.deepEqual({...a.input,prompt:null},{...b.input,prompt:null});assert.notEqual(a.input.prompt,b.input.prompt);
 const control=[a,b].find(s=>s.variant==='current'),candidate=[a,b].find(s=>s.variant==='motion-only');assert(control&&candidate);
 const baseline=source.find((r:any)=>r.caseId===k.caseId&&r.variant==='half-video'&&!r.error);
 assert.deepEqual(control.input,baseline.input);assert(candidate.input.prompt.startsWith(plan.motionOnlyPrompt));
 const anchor=source.find((r:any)=>r.caseId===k.caseId&&r.variant==='half'&&!r.error);assert.equal(anchor.input.resolution,'0.5K');
 for(const side of ['A','B']){
  const s=k[side];assert.equal(round[side],`assets/${s.file}`);
  assert.equal(s.input.reference_image_urls[0],anchor.sha256);assert.equal(s.coldRequestSumMs,s.requestMs+anchor.requestMs);
  assert(Number(s.duration)>=4.9);assert.equal(s.width,a.width);assert.equal(s.height,a.height);
  const bytes=await fs.readFile(`${dir}/assets/${s.file}`);assert.equal(createHash('sha256').update(bytes).digest('hex'),s.sha256);assert.deepEqual(bytes,await fs.readFile(`${archive}/${s.file}`));
  assert(records.filter((r:any)=>r.fingerprint===s.fingerprint).length<=2);
 }
}
assert.deepEqual(new Set(key.key.map((k:any)=>k.caseId)),new Set(['upload-celery-body-1','upload-celery-body-2','upload-oyster-body-1','upload-oyster-body-2']));
await fs.writeFile(`${archive}/contract-verification.json`,JSON.stringify({passed:true,pairs:4,outputs:8,onlyPromptVaries:true,productionBaselineExact:true,halfKAnchors:true,mediaHashesVerified:true,blindMappingVerified:true,failedAttempts:records.filter((r:any)=>r.error).length},null,2));
console.log('Verified four prompt-only pairs, exact production controls, 0.5K anchors, media hashes and latency accounting.');
