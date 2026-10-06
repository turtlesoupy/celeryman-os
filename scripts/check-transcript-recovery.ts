import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
 for(const fragment of ['And please','']){
  const page=await browser.newPage();await page.addInitScript('window.__name = value => value;');let fallbacks=0,plans=0;
  await page.routeWebSocket('**',socket=>socket.close());
  await page.route('**/api/transcribe',async route=>{
   fallbacks++;const body=route.request().postDataJSON();
   assert.equal(body.audio,'recorded-audio');
   await route.fulfill({json:{text:'Computer load up celeryman please',requestId:body.requestId,model:'file-test',transcriptionMs:1}});
  });
  await page.route('**/api/command',async route=>{plans++;await route.fulfill({json:{action:'reaction',response:''}});});
  await page.goto('http://127.0.0.1:5173');
  await page.evaluate(async fragment=>{
   const c=(window as any).cinco;c.setMode('reference');c.setSound(false);await c.apply({action:'attention',response:''},true);
   await c.receiveAudio('recorded-audio','audio/webm',undefined,{requestId:'recovery-1',durationMs:2700,peak:.2,device:'Test microphone'},
    {finish:async()=>({text:fragment,model:'stream-test',transcriptionMs:1})});
  },fragment);
  await page.locator('[aria-label="CINCO ID"]').waitFor();
  assert.equal(fallbacks,1);assert.equal(plans,0);
  const inputs=await page.evaluate(()=>(window as any).cinco.events.filter((e:any)=>e.kind==='input'));
  assert.equal(inputs.length,1);assert.equal(inputs[0].text,'Computer load up celeryman please');
  await page.close();
 }
 for(const supersede of [false,true]){
  const page=await browser.newPage();await page.addInitScript('window.__name = value => value;');let requested!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>requested=resolve),ready=new Promise<void>(resolve=>release=resolve);
  await page.routeWebSocket('**',socket=>socket.close());
  await page.route('**/api/transcribe',async route=>{
   requested();await ready;
   await route.fulfill({json:{text:supersede?'Computer load up celeryman please':'And please',requestId:route.request().postDataJSON().requestId,model:'file-test',transcriptionMs:1}});
  });
  await page.goto('http://127.0.0.1:5173');
  const pending=page.evaluate(async()=>{
   const c=(window as any).cinco;c.setMode('reference');c.setSound(false);await c.apply({action:'attention',response:''},true);
   await c.receiveAudio('recorded-audio','audio/webm',undefined,{requestId:'recovery-2',durationMs:2700,peak:.2,device:'Test microphone'},
    {finish:async()=>({text:'And please',model:'stream-test',transcriptionMs:1})});
  });
  await started;
  if(supersede)await page.evaluate(()=>(window as any).cinco.reset());
  release();await pending;
  assert.equal(await page.evaluate(()=>(window as any).cinco.events.filter((e:any)=>e.kind==='input').length),0);
  if(!supersede)assert.match(await page.locator('.command-status').innerText(),/complete command/i);
  await page.close();
 }
 console.log('PASS: fragment/empty recovery, no false acknowledgment, and reset cancels recovery');
}finally{await browser.close();}
