import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:960,height:540}});
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
let releaseOyster!:()=>void;
const oysterReady=new Promise<void>(resolve=>releaseOyster=resolve);
let oysterRequested=false;
try{
 await page.routeWebSocket('**',ws=>ws.close());
 await page.route('**/api/**',route=>route.fulfill({json:{}}));
 await page.route('**/music-oyster.wav',async route=>{
  oysterRequested=true;await oysterReady;
  await route.fulfill({contentType:'audio/wav',body:await readFile('public/media/original/music-oyster.wav')});
 });
 await page.goto('http://127.0.0.1:5173');
 await page.evaluate(async()=>{const c=(window as any).cinco;c.setMode('reference');await c.apply({action:'celery',response:''},true);});
 const music=()=>page.evaluate(()=>(window as any).cinco.state().music);
 const playing=async(character:string)=>page.waitForFunction(character=>{
  const m=(window as any).cinco.state().music;
  return m?.url.replace(/\?v=\d+$/,'')===`/media/original/music-${character}.wav`&&m.playing;
 },character);
 await playing('celery');
 await page.evaluate(()=>(window as any).cinco.apply({action:'oyster',response:''},true));
 await page.waitForFunction(()=>document.querySelectorAll('video[data-character="oyster"]').length===2);
 assert.equal((await music()).playing,false,'Previous score must stop while the foreground score loads');
 const celery=page.locator('[aria-label="CINCO ID"]');
 const oyster=page.locator('[aria-label="OYSTER"]');
 await celery.locator('.titlebar').click({position:{x:50,y:10}});
 await playing('celery');
 assert(oysterRequested,'Exercise a soundtrack request that finishes after focus changes');
 releaseOyster();
 // The pending decode must not reclaim audio after selecting another window.
 await page.waitForTimeout(500);
 assert.equal((await music()).url,'/media/original/music-celery.wav');
 await oyster.locator('.titlebar').click({position:{x:50,y:10}});
 await playing('oyster');
 await oyster.locator('.min').click();await playing('celery');
 await oyster.locator('.min').click();await playing('oyster');
 await oyster.locator('.close').click();await playing('celery');
 // A foreground utility window must not replace the highest sequence's score.
 await page.keyboard.press('F1');await playing('celery');
 await page.keyboard.press('Escape');
 await celery.locator('.titlebar').click({position:{x:50,y:10}});
 await playing('celery');
 // 4d3d3d3 switches to the sketch's second track, and focusing the portrait must keep it.
 await page.evaluate(()=>(window as any).cinco.apply({action:'engage',response:''},true));
 await playing('engaged');
 await page.locator('.window.portrait').dispatchEvent('pointerdown');await page.waitForTimeout(200);
 await playing('engaged');
 // Remove all remaining sequences through their controls, including portraits.
 while(await page.locator('.window:has(video)').count()){
  const win=page.locator('.window:has(video)').first();
  await win.dispatchEvent('pointerdown');await win.locator('.close').click();
 }
 assert.equal(await music(),undefined,'Closing the last sequence must stop its score');
 assert.deepEqual(errors,[]);
 console.log('PASS: foreground audio, delayed loading race, minimize/restore/close, and utility windows');
}finally{releaseOyster();await browser.close();}
