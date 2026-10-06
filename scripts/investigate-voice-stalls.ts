import fs from 'node:fs/promises';
import {channel} from 'node:diagnostics_channel';
import {clonedStream} from '../server/computer-voice.ts';

// No cache, retries, alternate model, or shortened provider deadline. Preserve
// failed trials and HTTP milestones rather than measuring only successful TTS.
const folder=`benchmarks/voice-stalls-${Date.now()}`;
await fs.mkdir(folder,{recursive:true});
const trials:any[]=[];let active:any,started=0;
for(const event of ['beforeConnect','connected','connectError','sendHeaders']){
 channel(`undici:client:${event}`).subscribe((message:any)=>{
  if(active)active.transport.push({event,ms:performance.now()-started,host:message.connectParams?.hostname,error:message.error?.message});
 });
}
for(const event of ['bodySent','headers','trailers','error']){
 channel(`undici:request:${event}`).subscribe((message:any)=>{
  if(active)active.transport.push({event,ms:performance.now()-started,status:message.response?.statusCode,error:message.error?.message});
 });
}
for(let i=0;i<12;i++){
 if(i===4||i===8)await new Promise(r=>setTimeout(r,12000));
 active={trial:i+1,startedAt:new Date().toISOString(),stages:[],transport:[]};started=performance.now();
 const row=active;trials.push(row);
 const text=i%2?'Yes, Tommy!':'Good morning Tommy.\nWhat will your first sequence of the day be?';
 row.text=text;
 try{
  const {pcm,...result}=await clonedStream(text,'hd',()=>{},undefined,{onProgress:p=>{row.stages.push(p);console.log(JSON.stringify({trial:i+1,...p}));}});
  Object.assign(row,result,{bytes:pcm.length});
  await fs.writeFile(`${folder}/trial-${i+1}.pcm`,pcm);
 }catch(error){row.error=String(error);}
 row.elapsedMs=performance.now()-started;active=undefined;
 await fs.writeFile(`${folder}/report.json`,JSON.stringify(trials,null,2));
 console.log(JSON.stringify({trial:i+1,elapsedMs:row.elapsedMs,firstChunkMs:row.firstChunkMs,error:row.error,folder}));
}
// Exercise the actual long-lived app process, including the browser's abort
// pattern. Unique phrases keep these trials out of the application WAV cache.
for(let i=0;i<8;i++){
 const row:any={path:'http',trial:i+1,startedAt:new Date().toISOString(),cancel:i===1||i===4};
 trials.push(row);const start=performance.now(),controller=new AbortController();
 const timer=row.cancel?setTimeout(()=>controller.abort(),i===1?50:500):undefined;
 try{
  const response=await fetch('http://127.0.0.1:5173/api/voice/stream',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({text:`Good morning Tommy. Voice connection check ${folder.split('-').at(-1)} ${i+1}.`}),
   signal:AbortSignal.any([controller.signal,AbortSignal.timeout(35000)])
  });
  row.headersMs=performance.now()-start;let pending='';const decoder=new TextDecoder();
  for await(const chunk of response.body!){
   pending+=decoder.decode(chunk,{stream:true});let at:number;
   while((at=pending.indexOf('\n'))>=0){
    const line=pending.slice(0,at);pending=pending.slice(at+1);if(!line)continue;
    const event=JSON.parse(line);
    if(event.type==='pcm'){row.firstChunkMs??=performance.now()-start;row.bytes=(row.bytes||0)+Buffer.from(event.data,'base64').length;}
    if(event.type==='done')row.server=event;
    if(event.type==='error')throw Error(event.error);
   }
  }
  if(!row.server)throw Error('No completion event');
 }catch(error){row.error=String(error);}
 finally{clearTimeout(timer);}
 row.elapsedMs=performance.now()-start;
 await fs.writeFile(`${folder}/report.json`,JSON.stringify(trials,null,2));console.log(JSON.stringify(row));
}
