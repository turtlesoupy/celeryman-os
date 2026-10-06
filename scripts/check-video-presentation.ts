import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const clip=await fs.readFile('public/media/motion/celery-5s.mp4');
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return {promise,resolve};};
try{
 for(const flag of [true,false]){
  const page=await browser.newPage(),body=deferred(),face=deferred(),requests:any[]=[];
  let providerReady=false;
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/**',async route=>{
   if(route.request().url().endsWith('/api/generate')){
    const request=route.request().postDataJSON();requests.push(request);
    await route.fulfill({json:{id:request.variant,status:'working',stage:'Rendering dance'}});
   }else if(route.request().url().includes('/api/job/')){const id=route.request().url().split('/').pop();await route.fulfill({json:{id,status:'working',stage:'Rendering dance',...(providerReady?{previewUrl:`/fixture-${id}.mp4`}:{})}});}
   else await route.fulfill({json:{}});
  });
  await page.route('**/fixture-*.mp4',async route=>{
   await (route.request().url().includes('face')?face:body).promise;
   await route.fulfill({contentType:'video/mp4',body:clip});
  });
  await page.goto(`http://127.0.0.1:5173/?fastPath=${flag?1:0}`);
  const pending=page.evaluate(async()=>{const c=(window as any).cinco;c.setSound(false);await c.apply({action:'celery',response:'Celery Man.'});});
  await page.waitForFunction(()=>document.querySelector('.generation-overlay strong')?.textContent==='Rendering dance');
  assert.equal(await page.locator('[data-id=loader]').count(),0,'Generation has no standalone loading window');
  assert.equal(await page.locator('.terminal-display .generation-overlay').isVisible(),true);
  if(flag){await fs.mkdir('output/generation-overlay',{recursive:true});await page.screenshot({path:'output/generation-overlay/desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/generation-overlay/mobile.png'});assert.equal(await page.locator('.terminal-display .generation-overlay').isVisible(),true);await page.setViewportSize({width:1280,height:720});}
  providerReady=true;await pending;
  await page.waitForFunction(()=>document.querySelectorAll('.window video').length===2);
  await page.waitForTimeout(700);
  assert.equal(await page.locator('.window:has(video):visible').count(),0,'No empty video window while downloads are held');
  assert.equal(requests.length,2);assert(requests.every(r=>r.fastPath===flag));
  assert.deepEqual(requests.map(r=>r.variant).sort(),['base','face']);
  body.resolve();
  await page.locator('.window:not(.portrait):has(video)').waitFor({state:'visible'});
  assert.equal(await page.locator('.portrait').isVisible(),false,'Body need not wait for portrait');
  assert.equal(await page.locator('.generation-overlay').isVisible(),true,'Portrait loading keeps terminal progress visible');
  assert(await page.locator('.window:not(.portrait) video').evaluate((v:HTMLVideoElement)=>v.readyState>=2));
  face.resolve();await page.locator('.portrait').waitFor({state:'visible'});
  assert(await page.locator('.portrait video').evaluate((v:HTMLVideoElement)=>v.readyState>=2));
  assert.equal(await page.evaluate(()=>(window as any).cinco.events.filter((e:any)=>e.kind==='video-visible').length),2);
  assert.equal(await page.locator('.generation-overlay').isVisible(),false,'First frames clear the overlay');
  assert.deepEqual(errors,[]);await page.close();
 }
 // Closing pending windows must not reveal them again when a download completes.
 const page=await browser.newPage(),held=deferred();
 await page.route('**/api/**',async route=>await route.fulfill({json:route.request().url().endsWith('/api/generate')?{id:'held',status:'complete',url:'/held.mp4'}:{}}));
 await page.route('**/held.mp4',async route=>{await held.promise;await route.fulfill({contentType:'video/mp4',body:clip});});
 await page.goto('http://127.0.0.1:5173/?fastPath=1');
 await page.evaluate(async()=>{const c=(window as any).cinco;c.setSound(false);await c.apply({action:'celery',response:'Celery Man.'});c.reset();});
 held.resolve();await page.waitForTimeout(500);
 assert.equal(await page.locator('.window:has(video)').count(),0);
 assert.equal(await page.evaluate(()=>(window as any).cinco.events.filter((e:any)=>e.kind==='video-visible').length),0);
 await page.close();
 console.log('Passed: both flags reach portrait/body requests, delayed media stays hidden, independent first-frame reveal, reset cancels pending presentation.');
}finally{await browser.close();}
