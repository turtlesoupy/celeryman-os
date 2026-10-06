/** Consume PCM arrivals directly, without the SDK's per-chunk polling delay. */
export async function collectPcm(body:ReadableStream<Uint8Array>,onChunk:(chunk:Buffer)=>void,signal?:AbortSignal){
 const started=performance.now(),chunks:Buffer[]=[];
 let firstChunkMs:number|undefined,ended=false;
 const reader=body.getReader();
 const abort=()=>{void reader.cancel(signal?.reason).catch(()=>{});};
 signal?.addEventListener('abort',abort,{once:true});
 try{
  signal?.throwIfAborted();
  while(true){
   const {value,done}=await reader.read();signal?.throwIfAborted();
   if(done){ended=true;break;}
   if(!(value instanceof Uint8Array))throw Error('Unexpected non-PCM streaming response');
   const chunk=Buffer.from(value);if(!chunk.length)continue;
   firstChunkMs??=performance.now()-started;chunks.push(chunk);onChunk(chunk);
  }
  const pcm=Buffer.concat(chunks);if(!pcm.length||pcm.length%2)throw Error('Incomplete PCM audio');
  return {pcm,firstChunkMs,completeMs:performance.now()-started};
 }finally{
  signal?.removeEventListener('abort',abort);
  if(!ended)await reader.cancel().catch(()=>{});
  reader.releaseLock();
 }
}
