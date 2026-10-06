import assert from 'node:assert/strict';
import {collectPcm} from '../server/pcm-stream.ts';

class Stream{
 controller!:ReadableStreamDefaultController<Uint8Array>;
 cancelled=false;
 body=new ReadableStream<Uint8Array>({start:controller=>{this.controller=controller;},cancel:()=>{this.cancelled=true;}});
 emit(value:unknown){this.controller.enqueue(value as Uint8Array);}
 close(){this.controller.close();}
}
// A burst must reach the client before completion, without per-chunk timers.
const burst=new Stream(),received:Buffer[]=[];
const complete=collectPcm(burst.body,chunk=>received.push(chunk));
const expected=Array.from({length:200},(_,i)=>Buffer.from([i,0]));
for(const chunk of expected)burst.emit(chunk);
await new Promise(resolve=>setImmediate(resolve));
assert.equal(received.length,200);assert.deepEqual(Buffer.concat(received),Buffer.concat(expected));
burst.close();assert.deepEqual((await complete).pcm,Buffer.concat(expected));
// Cancelling a partial stream must never return it as a cacheable result.
const cancelled=new Stream(),controller=new AbortController();
const pending=collectPcm(cancelled.body,()=>{},controller.signal);cancelled.emit(Buffer.from([1,0]));controller.abort();
await assert.rejects(pending,{name:'AbortError'});assert(cancelled.cancelled);
const alreadyCancelled=new Stream();await assert.rejects(collectPcm(alreadyCancelled.body,()=>{},controller.signal),{name:'AbortError'});assert(alreadyCancelled.cancelled);
// Deadline aborts, invalid payloads, interrupted samples and downstream errors surface.
const stalled=new Stream(),deadline=new AbortController(),timed=collectPcm(stalled.body,()=>{},deadline.signal);deadline.abort(new DOMException('Timed out','TimeoutError'));await assert.rejects(timed,{name:'TimeoutError'});
for(const payload of [{bad:true},Buffer.from([1]),Buffer.alloc(0)]){
 const source=new Stream(),result=collectPcm(source.body,()=>{});source.emit(payload);source.close();await assert.rejects(result,/Unexpected non-PCM|Incomplete PCM/);
}
const downstream=new Stream(),failed=collectPcm(downstream.body,()=>{throw Error('Disconnected client');});downstream.emit(Buffer.from([1,0]));await assert.rejects(failed,/Disconnected client/);assert(downstream.cancelled);
const provider=new Stream(),rejected=collectPcm(provider.body,()=>{});provider.controller.error(Error('Provider failure'));await assert.rejects(rejected,/Provider failure/);
// Native fetch cancellation must not leave the SDK's unhandled reader rejection.
const previousVoice=process.env.COMPUTER_VOICE_ID;process.env.COMPUTER_VOICE_ID='local-test-voice';
const {clonedStream}=await import('../server/computer-voice.ts');
const originalFetch=globalThis.fetch,unhandled:unknown[]=[];const record=(error:unknown)=>unhandled.push(error);process.on('unhandledRejection',record);
const interrupt=new AbortController();
globalThis.fetch=async(_url,init)=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,0]));init!.signal!.addEventListener('abort',()=>c.error(new DOMException('Cancelled','AbortError')));}}),{headers:{'Content-Type':'application/octet-stream'}});
try{await assert.rejects(clonedStream('Mock voice','hd',()=>interrupt.abort(),interrupt.signal),{name:'AbortError'});await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[]);}finally{globalThis.fetch=originalFetch;process.removeListener('unhandledRejection',record);if(previousVoice===undefined)delete process.env.COMPUTER_VOICE_ID;else process.env.COMPUTER_VOICE_ID=previousVoice;}
console.log('PCM stream checks passed: immediate burst delivery, byte preservation, cancellation, deadline, invalid data, provider/client errors, and no unhandled fetch rejection.');
