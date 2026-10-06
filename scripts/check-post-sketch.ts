import 'dotenv/config';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {chromium} from 'playwright';
import {routeIntent} from '../server/intent-router.ts';
import {scripted,sketch} from '../src/protocol.ts';
const context={identity:'Big dog',character:'tayne',pending:'',history:[],scriptStep:sketch.length};
const client=new OpenAI({maxRetries:0});
for(const text of ['Can you show me a carrot dance?','Computer, show me a new sequence.']){
 assert.equal(scripted(text,context),null);
 const r=await routeIntent(client,text,context);assert.equal(r.intent,'new_character');console.log(text,r.intent);
}
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.addInitScript('window.__name = value => value;');
 await page.route('**/api/**',route=>route.fulfill({json:{}}));
 await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:5173')+'/?fastPath=1');
 const guide=await page.evaluate(async()=>{
  const {createScriptGuide}=await import('/src/script-guide.ts');
  const host=document.createElement('div'),inline=document.createElement('div');const g=createScriptGuide(host,inline);
  g.observe('print','print');const merged=host.textContent;
  g.observe('important work','chaos');return {merged,end:inline.textContent,index:g.nextIndex()};
 });
 assert.match(guide.merged!,/Computer, do we have any new sequences/);assert.match(guide.end!,/show me a new sequence/);assert.equal(guide.index,sketch.length);
 await page.evaluate(async()=>{const c=(window as any).cinco;c.setSound(false);c.setMode('reference');await c.apply({action:'chaos',response:''});await c.apply({action:'dialogue',response:'I am the computer. Shall I load it?'});});
 await page.waitForFunction(()=>document.querySelector('[data-id="terminal"] .content')?.textContent?.includes('Shall I load it?'));
 // Dialogue answers never hold a pending state that could block a sketch cue.
 assert.equal(await page.evaluate(()=>(window as any).cinco.state().context.pending),'');
 console.log('Passed: merged guide, continuing cue, new-character routing and visible dialogue after finale.');
}finally{await browser.close();}
