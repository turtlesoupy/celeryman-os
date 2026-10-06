// Browser smoke test for director beats, in reference mode with sound off.
// Plays the whole sketch first (it must be unchanged), then the director's
// scenes. Routing hits the dev server's real LLM; video generation is blocked
// and unknown performers play a reference clip. Screenshots: output/director/.
//   TEST_ORIGIN=http://127.0.0.1:5173 npx tsx scripts/check-director-ui.ts
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {sketch} from '../src/protocol.ts';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173',out='output/director';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}});
 await page.addInitScript('window.__name = value => value;');
 await page.route('**/api/generate',route=>route.abort());
 const known=new Set((await fs.readdir('public/media/original')).filter(f=>f.endsWith('.mp4')));
 await page.route('**/media/original/*.mp4',async route=>{
  const name=decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()!);
  if(known.has(name))return route.continue();
  await route.fulfill({path:'public/media/original/tayne-sway.mp4',contentType:'video/mp4'});
 });
 await page.goto(origin+'/');
 await page.evaluate(()=>{const c=(window as any).cinco;c.setMode('reference');c.setSound(false);});
 const say=(text:string)=>page.evaluate(t=>(window as any).cinco.dispatch(t,'keyboard'),text);
 const terminal=()=>page.locator('[data-id="terminal"] .content').innerText();
 const lastAction=()=>page.evaluate(()=>{const e=(window as any).cinco.events.filter((x:any)=>x.kind==='action'&&'response' in x).at(-1);return e?.beat?`${e.action}:${e.beat.kind}${e.beat.stage?':'+e.beat.stage:''}`:e?.action;});
 const shot=(name:string)=>page.screenshot({path:`${out}/${name}.png`});

 // The blessed sketch, line by line.
 const actions:string[]=[];
 for(const step of sketch){await say(step.text);actions.push(await lastAction());}
 assert.deepEqual(actions,sketch.map(s=>s.action),'sketch actions changed');
 await page.waitForTimeout(2500);await shot('01-sketch-chaos');

 await say("What's up with the Mets?");
 await page.waitForFunction(()=>/\?\s*$/.test(document.querySelector('[data-id="terminal"] .content')?.textContent||''));
 await page.waitForTimeout(400);await shot('02-pitch');
 const pitch=await terminal();assert.match(pitch,/\?\s*$/);
 const offer=await page.evaluate(()=>(window as any).cinco.state().context.director.offer);assert.ok(offer?.label,'offer stored');

 await say('Yes.');assert.equal(await lastAction(),'director:reveal');
 await page.waitForSelector('.title-card canvas');await page.waitForTimeout(600);await shot('03-reveal-title-card');
 assert.equal(await page.evaluate(()=>(window as any).cinco.state().context.director.offer),undefined);

 await say('Turn on turbo mode.');assert.equal(await lastAction(),'director:mode');
 assert.ok(await page.evaluate(()=>document.querySelector<HTMLElement>('.desktop')!.dataset.mode),'mode applied');

 await say('Make him evil.');assert.equal(await lastAction(),'director:taboo:repeat');
 await say('Make him evil.');assert.equal(await lastAction(),'director:taboo:warn');
 await page.waitForSelector('.warning-flash');await shot('04-taboo-warning');
 await say('Mm-hmm.');assert.equal(await lastAction(),'director:taboo:reveal');
 await page.waitForSelector('canvas.mosaic');await page.waitForTimeout(1200);await shot('05-taboo-mosaic');
 assert.equal(await page.evaluate(()=>(window as any).cinco.state().context.director.armed),true);

 await say('Oh no.');assert.equal(await lastAction(),'director:call');
 await page.waitForSelector('[data-id="call"] .label');await page.waitForTimeout(400);await shot('06-call');
 const caller=await page.locator('[data-id="call"] .label').innerText();assert.notEqual(caller,'WIFE');

 await say('Ignore it.');assert.equal(await lastAction(),'director:chaos');
 await page.waitForTimeout(2600);await shot('07-chaos');
 const error=await page.locator('.error .content').first().innerText();assert.match(error,/ERROR: BETA EVIL/);
 console.log(JSON.stringify({pitch,offer:offer.label,caller,error},null,1));
 console.log(`Passed: sketch unchanged in the browser, then pitch, reveal, mode, taboo ladder, call and chaos. Screenshots in ${out}/.`);
}finally{await browser.close();}
