import {Readable} from 'node:stream';
import type {IncomingMessage,ServerResponse} from 'node:http';

// One provider download feeds persistence and every browser range request.
// Readers can consume received bytes without waiting for the whole video.
export class VideoDownload{
 readonly ready:Promise<void>;
 readonly completed:Promise<Buffer>;
 length?:number;
 contentType='video/mp4';
 private chunks:{start:number;bytes:Buffer}[]=[];
 private received=0;
 private finished=false;
 private failure?:Error;
 private wake!:()=>void;
 private changed=new Promise<void>(resolve=>{this.wake=resolve;});
 constructor(url:string){
  const response=fetch(url,{signal:AbortSignal.timeout(30000)});
  const ready=this.ready=response.then(result=>{
   if(!result.ok||!result.body)throw Error('Video download failed');
   const length=result.headers.get('content-length');
   if(length!==null&&Number.isSafeInteger(Number(length))&&Number(length)>=0)this.length=Number(length);
   this.contentType=result.headers.get('content-type')||'video/mp4';
  });
  this.completed=(async()=>{
   try{
    await ready;
    const reader=(await response).body!.getReader();
    for(;;){
     const {done,value}=await reader.read();if(done)break;
     const bytes=Buffer.from(value);this.chunks.push({start:this.received,bytes});this.received+=bytes.length;this.notify();
    }
    if(this.length!==undefined&&this.length!==this.received)throw Error('Incomplete video download');
    this.length=this.received;this.finished=true;this.notify();
    return Buffer.concat(this.chunks.map(chunk=>chunk.bytes),this.received);
   }catch(error){this.failure=error instanceof Error?error:Error(String(error));this.notify();throw this.failure;}
  })();
  void this.completed.catch(()=>{});
 }
 private notify(){const wake=this.wake;this.changed=new Promise<void>(resolve=>{this.wake=resolve;});wake();}
 async *read(start:number,end:number){
  let offset=start;
  while(offset<=end){
   if(this.failure)throw this.failure;
   const chunk=this.chunks.find(chunk=>chunk.start<=offset&&chunk.start+chunk.bytes.length>offset);
   if(chunk){const bytes=chunk.bytes.subarray(offset-chunk.start,Math.min(chunk.bytes.length,end-chunk.start+1));offset+=bytes.length;yield bytes;}
   else if(this.finished)return;
   else await this.changed;
  }
 }
}

export async function serveVideoPreview(download:VideoDownload,req:IncomingMessage,res:ServerResponse){
 await download.ready;
 // Providers normally send Content-Length; fall back to the shared buffer if not.
 if(download.length===undefined)await download.completed;
 const length=download.length!;
 let start=0,end=length-1;
 const range=req.headers.range;
 if(range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(range);
  if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${length}`});res.end();return;}
  if(match[1]){start=Number(match[1]);if(match[2])end=Math.min(Number(match[2]),end);}
  else start=Math.max(0,length-Number(match[2]));
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=length){res.writeHead(416,{'Content-Range':`bytes */${length}`});res.end();return;}
  res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${length}`);
 }
 res.setHeader('Content-Type',download.contentType);
 res.setHeader('Content-Length',end-start+1);
 res.setHeader('Accept-Ranges','bytes');
 res.setHeader('Cache-Control','private, max-age=3600');
 if(req.method==='HEAD'){res.end();return;}
 const stream=Readable.from(download.read(start,end));
 stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}

// Only actual provider outputs are registered; callers cannot proxy arbitrary URLs.
const shared=globalThis as typeof globalThis & {cincoVideoDownloads?:Map<string,VideoDownload>};
export const videoPreviews=shared.cincoVideoDownloads??=new Map<string,VideoDownload>();
