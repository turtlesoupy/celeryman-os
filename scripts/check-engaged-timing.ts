import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage();const clip=await fs.readFile('public/media/motion/celery-5s.mp4');
 let release!:()=>void;const gate=new Promise<void>(r=>release=r);
 await page.route('**/api/**',async route=>{
  const url=route.request().url();
  if(url.endsWith('/api/generate')){const b=route.request().postDataJSON();await route.fulfill({json:{id:b.variant,status:'complete',url:`/fixture-${b.variant}.mp4`}});}
  else await route.fulfill({json:{}});
 });
 await page.route('**/fixture-*.mp4',async route=>{if(route.request().url().includes('engaged'))await gate;await route.fulfill({contentType:'video/mp4',body:clip});});
 await page.goto('http://127.0.0.1:5173/?fastPath=1');
 await page.evaluate(async()=>{const c=(window as any).cinco;c.setSound(false);await c.apply({action:'celery',response:'Ready'});});
 await page.locator('.window:not(.portrait):has(video)').waitFor({state:'visible'});
 await page.evaluate(()=>{const c=(window as any).cinco;c.setSound(true);(window as any).engageDone=false;void c.apply({action:'engage',response:'4d3d3d3 Engaged.',audio:'engaged'}).then(()=>(window as any).engageDone=true);});
 await page.waitForFunction(()=>!!document.querySelector('video[src*="fixture-engaged"]'));
 assert.equal(await page.evaluate(()=>(window as any).cinco.events.some((e:any)=>e.kind==='audio'&&e.text==='4d3d3d3 Engaged.')),false);
 assert.equal(await page.evaluate(()=>(window as any).engageDone),false);
 release();await page.waitForFunction(()=>(window as any).engageDone);
 await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='audio'&&e.text==='4d3d3d3 Engaged.'));
 assert(await page.locator('video[src*="fixture-engaged"]').evaluate((v:HTMLVideoElement)=>v.readyState>=2));
 console.log('Passed: engaged speech waits for the replacement video frame, not just its URL.');
}finally{await browser.close();}
