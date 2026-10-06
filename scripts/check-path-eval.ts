import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const archive='analysis/path-eval-20261005',dir='public/path-eval';
const read=async(file:string)=>JSON.parse(await fs.readFile(file,'utf8'));
const [plan,data,reveal,records]=await Promise.all([read(`${archive}/plan.json`),read(`${dir}/rounds.json`),read(`${dir}/reveal.json`),read(`${archive}/requests.json`)]);
assert.equal(data.id,plan.id);assert.equal(reveal.id,plan.id);assert.equal(data.rounds.length,12);assert.equal(reveal.key.length,12);
const successful=records.filter((r:any)=>!r.error);assert.equal(successful.length,26);
assert.equal(new Set(successful.map((r:any)=>r.fingerprint)).size,26);
for(const row of successful){
 const bytes=await fs.readFile(`${dir}/assets/${row.file}`);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),row.sha256);
 assert.match(row.file,/^[a-f0-9-]{36}\.(png|mp4)$/);
 if(row.kind==='video')assert(Number(row.duration)>=4.9,'Enough generated frames to review all five requested seconds');
}
const sizes:any[]=[];
for(const kind of ['image','video']){
 const rounds=data.rounds.filter((r:any)=>r.kind===kind);assert.equal(rounds.length,6);
 assert.equal(plan.rounds.filter((r:any)=>r.kind===kind&&r.baselineOnA).length,3);
 const repeats=new Map<string,Set<number>>();
 for(const round of rounds){
  for(const forbidden of ['variant','model','requestMs','coldRequestSumMs','seed','take','caseId'])assert(!(forbidden in round),'Blind manifest must not disclose treatment');
  const k=reveal.key.find((r:any)=>r.id===round.id);assert(k);
  const planRound=plan.rounds.find((r:any)=>r.id===round.id);const expected=kind==='image'?'nb2':'anchored';assert.equal(k.A.variant===expected,planRound.baselineOnA);
  for(const side of ['A','B'])assert.equal(round[side],`assets/${k[side].file}`);
  const stem=k.caseId.replace(/-[12]$/,'');const seen=repeats.get(stem)||new Set<number>();seen.add(k.take);repeats.set(stem,seen);
  const a=k.A,b=k.B;assert.equal(a.input.prompt,b.input.prompt);
  assert.equal(a.input.seed,b.input.seed);
  if(kind==='image'){
   assert.deepEqual(a.input.image_urls,b.input.image_urls);
   const qwen=a.variant==='qwen'?a:b;assert.equal(qwen.input.enable_prompt_expansion,false);
   const sameDimensions=a.width===b.width&&a.height===b.height;
   sizes.push({caseId:k.caseId,sameDimensions,A:[a.width,a.height],B:[b.width,b.height]});
  }else{
   assert.equal(a.model,b.model);
   for(const field of ['reference_video_urls','duration','resolution','aspect_ratio','prompt_expansion_mode'])assert.deepEqual(a.input[field],b.input[field]);
   const anchored=a.variant==='anchored'?a:b,direct=a.variant==='direct'?a:b;
   assert.equal(anchored.input.reference_image_urls.length,2);assert.equal(direct.input.reference_image_urls.length,1);
   assert.equal(anchored.input.reference_image_urls[1],direct.input.reference_image_urls[0]);
   const image=successful.find((r:any)=>r.caseId===k.caseId&&r.variant==='nb2');assert(image);
   assert.equal(anchored.input.reference_image_urls[0],image.sha256);
   assert.equal(image.input.resolution,'1K');
   assert.equal(anchored.coldRequestSumMs,anchored.requestMs+image.requestMs);
   assert.equal(direct.coldRequestSumMs,direct.requestMs);
   assert(!direct.input.image_url);
   if(k.caseId.includes('oyster'))assert.equal(anchored.input.image_url,image.sha256);
  }
 }
 assert.equal(repeats.size,3);for(const takes of repeats.values())assert.deepEqual([...takes].sort(),[1,2]);
}
const report={passed:true,images:14,videos:12,pairs:12,independentTakesPerCase:2,balancedSidesPerBlock:true,identicalWithinPairPrompts:true,sourceHashesAndAssetsVerified:true,videoSettingsMatched:true,coldImageCostIncluded:true,imageDimensions:sizes,failedAttempts:records.filter((r:any)=>r.error).length};
await fs.writeFile(`${archive}/contract-verification.json`,JSON.stringify(report,null,2));
console.log('Verified blind mapping, input parity, all 26 media hashes, repeats, and latency accounting.');
if(sizes.some(x=>!x.sameDimensions))console.log('Provider output sizes differ; review archived dimensions before interpreting.');
