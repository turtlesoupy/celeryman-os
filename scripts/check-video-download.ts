import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {VideoDownload,serveVideoPreview} from '../server/video-preview.ts';

const fetchRemote=globalThis.fetch;
let calls=0,finish!:(()=>void),failed!:(()=>void);
const remainder=new Promise<void>(resolve=>finish=resolve);
const payload=Buffer.from('0123456789');
globalThis.fetch=(async()=>{
 calls++;
 return new Response(new ReadableStream({async start(controller){controller.enqueue(payload.subarray(0,4));await remainder;controller.enqueue(payload.subarray(4));controller.close();}}),{headers:{'content-length':'10','content-type':'video/mp4'}});
}) as typeof fetch;
const shared=new VideoDownload('https://fixture/video');
globalThis.fetch=fetchRemote;
const server=createServer((req,res)=>{void serveVideoPreview(shared,req,res).catch(()=>{res.statusCode=502;res.end();});});
await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${(server.address() as any).port}`;
try{
 const first=await fetchRemote(url,{headers:{Range:'bytes=0-3'}});
 assert.equal(first.status,206);assert.equal(first.headers.get('content-range'),'bytes 0-3/10');
 assert.equal(await first.text(),'0123','Initial bytes arrive before provider completion');
 let complete=false;void shared.completed.then(()=>complete=true);assert.equal(complete,false);
 const tail=fetchRemote(url,{headers:{Range:'bytes=-3'}}).then(async r=>({status:r.status,text:await r.text()}));
 const second=fetchRemote(url).then(r=>r.arrayBuffer());
 finish();
 assert.deepEqual(await tail,{status:206,text:'789'});
 assert.deepEqual(Buffer.from(await second),payload);assert.deepEqual(await shared.completed,payload);
 assert.equal(calls,1,'Browser ranges and persistence share one upstream fetch');
 const head=await fetchRemote(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
 assert.equal((await fetchRemote(url,{headers:{Range:'bytes=20-'}})).status,416);
 assert.equal((await fetchRemote(url,{headers:{Range:'bytes=-0'}})).status,416);
 // A failed upstream wakes pending readers instead of leaving video loads hanging.
 globalThis.fetch=(async()=>new Response(new ReadableStream({start(controller){failed=()=>controller.error(Error('Connection dropped'));}}),{headers:{'content-length':'10'}})) as typeof fetch;
 const broken=new VideoDownload('https://fixture/broken');globalThis.fetch=fetchRemote;
 await broken.ready;
 const pending=broken.read(0,9).next();failed();
 await assert.rejects(pending,/Connection dropped/);await assert.rejects(broken.completed,/Connection dropped/);
 console.log('Passed: one upstream download, progressive delivery before completion, parallel full/range readers, suffix ranges, HEAD, invalid ranges, failure propagation.');
}finally{globalThis.fetch=fetchRemote;server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
