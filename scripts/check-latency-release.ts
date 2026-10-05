import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {costumes,motions} from '../src/dances.ts';

const site='https://celeryman.fun';
const benchmark=JSON.parse(await fs.readFile('benchmarks/latency/production-after.json','utf8'));
const profile=benchmark.results[0].profile;
const post=(endpoint:string,body:any)=>fetch(site+'/api/'+endpoint,{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
const started=performance.now();
const response=await post('generate',{profile,character:'oyster',variant:'smile',canonical:true,costume:costumes.oyster,motion:motions.smile});
assert.equal(response.status,200);
let job=await response.json();
while(job.status==='working'){
 assert.ok(performance.now()-started<90000,'Smiling print frame timed out');
 await new Promise(r=>setTimeout(r,150));
 job=await(await fetch(site+'/api/job/'+job.id,{signal:AbortSignal.timeout(15000)})).json();
}
assert.equal(job.status,'complete',job.error);assert.ok(job.image.endsWith('-print.png'));
const image=await fetch(site+job.image);assert.equal(image.status,200);
const png=Buffer.from(await image.arrayBuffer());assert.equal(png.subarray(1,4).toString(),'PNG');assert.ok(png.length>1000);
const smile={id:job.id,profile,url:job.url,image:job.image,width:png.readUInt32BE(16),height:png.readUInt32BE(20),bytes:png.length,wallMs:performance.now()-started,timings:job.timings};
console.log(JSON.stringify({smile}));
const ranges=[];
for(const sample of benchmark.results){
 const r=await fetch(`${site}/media/generated/${sample.id}.mp4`,{headers:{Range:'bytes=0-1023'},signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,206);assert.equal((await r.arrayBuffer()).byteLength,1024);
 ranges.push({id:sample.id,status:r.status,contentRange:r.headers.get('content-range')});
}
const speechAt=performance.now();
const voice=await post('voice/stream',{text:'The computer is online. Your shoulder shimmy is now ready.'});assert.equal(voice.status,200);
let pending='',chunks=0,bytes=0,firstMs:number|undefined,done:any;
const decoder=new TextDecoder();
for await(const chunk of voice.body!){
 pending+=decoder.decode(chunk,{stream:true});let newline;
 while((newline=pending.indexOf('\n'))>=0){
  const line=pending.slice(0,newline);pending=pending.slice(newline+1);if(!line)continue;
  const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);
  if(event.type==='pcm'){firstMs??=performance.now()-speechAt;chunks++;bytes+=Buffer.from(event.data,'base64').length;}
  if(event.type==='done')done=event;
 }
}
assert.ok(chunks>0&&bytes>48000&&done?.url);
const audio=await fetch(site+done.url);assert.equal(audio.status,200);assert.equal((await audio.arrayBuffer()).byteLength,bytes+44);
const speech={firstMs,completeMs:performance.now()-speechAt,chunks,bytes,cached:done.cached,url:done.url};
console.log(JSON.stringify({speech}));
await fs.writeFile('benchmarks/latency/release-verification.json',JSON.stringify({created:new Date().toISOString(),site,smile,ranges,speech},null,2)+'\n');
