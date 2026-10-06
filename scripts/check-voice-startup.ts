import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {chromium} from 'playwright';
import {streamComputerVoice} from '../server/computer-voice.ts';

const cwd=process.cwd(),scratch=await fs.mkdtemp(path.join(os.tmpdir(),'cinco-voice-startup-'));
const originalFetch=globalThis.fetch,voice=process.env.COMPUTER_VOICE_ID;
process.env.COMPUTER_VOICE_ID='fixture-voice';
try{
 process.chdir(scratch);
 for(const scenario of ['complete','headers-error','partial-error','cancel']){
  let calls=0;const packets:Buffer[]=[],progress:any[]=[];const controller=new AbortController();
  globalThis.fetch=(async(input:any,init:any)=>{
   calls++;assert.match(String(input),/speech-2.8-hd\/stream$/);assert.equal(JSON.parse(init.body).voice_setting.voice_id,'fixture-voice');
   if(scenario==='headers-error')throw new DOMException('Provider stalled','TimeoutError');
   if(scenario==='cancel'){setTimeout(()=>controller.abort(),10);return new Promise((_,reject)=>init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true}));}
   if(scenario==='partial-error')return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([2,0]));setTimeout(()=>c.error(new DOMException('Stream stalled','TimeoutError')),10);}}),{headers:{'content-type':'application/octet-stream','x-fal-request-id':'fixture-request'}});
   return new Response(new Uint8Array([1,0,2,0]),{headers:{'content-type':'application/octet-stream'}});
  }) as typeof fetch;
  const pending=streamComputerVoice(scenario,chunk=>packets.push(chunk),controller.signal,{onProgress:p=>progress.push(p)});
  if(scenario==='complete'){await pending;assert.deepEqual(Buffer.concat(packets),Buffer.from([1,0,2,0]));}
  else{
   await assert.rejects(pending,{name:scenario==='cancel'?'AbortError':'TimeoutError'});
   const failure=progress.at(-1);assert.equal(failure.stage,scenario==='partial-error'?'reading-audio':'waiting-for-headers');
   assert.equal(failure.bytes,scenario==='partial-error'?2:0);
   if(scenario==='partial-error')assert.equal(failure.requestId,'fixture-request');
   if(scenario==='cancel')assert.equal(failure.abortedBy,'caller');
  }
  assert.equal(calls,1,'Never hide failures behind automatic retries');
 }
 assert.equal((await fs.readdir('public/media/voice')).length,1,'Only complete audio enters cache');
}finally{globalThis.fetch=originalFetch;process.chdir(cwd);if(voice===undefined)delete process.env.COMPUTER_VOICE_ID;else process.env.COMPUTER_VOICE_ID=voice;await fs.rm(scratch,{recursive:true,force:true});}

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const cancel of [false,true]){
  const page=await browser.newPage();let release!:()=>void;const held=new Promise<void>(r=>release=r);
  await page.route('**/api/voice/stream',async route=>{await held;await route.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({type:'error',error:'Voice provider did not start audio in time'})+'\n'});});
  await page.goto('http://127.0.0.1:5173/?fastPath=1');
  await page.evaluate(async()=>{const c=(window as any).cinco;c.setIdentity('thomas','Tommy');await c.dispatch('Good morning');});
  await page.waitForFunction(()=>document.querySelector('[aria-label="Computer response"]')?.textContent?.includes('Good morning Tommy.'),null,{timeout:2000});
  assert.match(await page.locator('.command-status').innerText(),/Generating voice/);
  if(cancel)await page.evaluate(()=>(window as any).cinco.dispatch('Computer?'));
  release();
  if(!cancel)await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='voice-error'));
  else{await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>(window as any).cinco.events.some((e:any)=>e.kind==='voice-error')),false);}
  await page.close();
 }
}finally{await browser.close();}
console.log('Passed: no hidden retries, failure stage diagnostics, complete-only cache, immediate greeting text, and interruption without stale errors.');
