import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {sketch,scripted,type Context} from '../src/protocol';
const live=process.argv.includes('--live'),audio=process.argv.includes('--audio');
await fs.mkdir('benchmarks/screenshots',{recursive:true});
const report:any={started:new Date().toISOString(),mode:live?'live-generation':'reference-protocol',checks:[],errors:[]};
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const page=await browser.newPage({viewport:{width:1440,height:810},recordVideo:{dir:'benchmarks/recordings',size:{width:1440,height:810}}});
page.setDefaultTimeout(300000);
page.on('pageerror',e=>report.errors.push(e.message));
await page.routeWebSocket('**',ws=>ws.close());
await page.goto('http://127.0.0.1:5173');
await page.evaluate((isLive)=>{(window as any).cinco.setMode(isLive?'live':'reference');(window as any).cinco.setIdentity('paul','Paul');},live);
await page.evaluate(()=>(window as any).cinco.startOutputCapture());
const ctx:Context={identity:'Paul',character:'celery',pending:'',history:[]};
for(const step of sketch){const cmd=scripted(step.text,ctx);assert.equal(cmd?.action,step.action,step.text);ctx.pending=cmd.action==='beta'?'beta':cmd.action==='repeat'?'repeat':cmd.action==='nsfw'?'nsfw':'';report.checks.push({kind:'protocol',input:step.text,expected:step.action,actual:cmd.action,pass:true});}
for(const [i,step]of sketch.entries()){
 const start=Date.now();
 if('keyboard'in step){await page.keyboard.press('F1');await page.getByRole('textbox',{name:'Computer command'}).fill(step.text);await page.getByRole('textbox',{name:'Computer command'}).press('Enter');await page.waitForFunction(text=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.text===text),step.text,{timeout:600000});if(live)await page.waitForFunction(()=>!document.querySelector('[data-id="loader"]'),{},{timeout:300000});await page.keyboard.press('Escape');}
 else if(audio&&i>0){const bytes=await fs.readFile(`benchmarks/voice-inputs/${String(i).padStart(2,'0')}.wav`);await page.evaluate(b64=>(window as any).cinco.receiveAudio(b64,'audio/wav'),bytes.toString('base64'));}
 else await page.evaluate(text=>(window as any).cinco.dispatch(text,'benchmark-voice-transcript'),step.text);
 await page.waitForTimeout(step.action==='tayne'?6500:step.action==='confirm'?7500:step.action==='chaos'?6500:1900);
 await page.screenshot({path:`benchmarks/screenshots/${live?'live':'reference'}-${String(i).padStart(2,'0')}-${step.action}.png`});
 const state=await page.evaluate(()=>(window as any).cinco.state());
 const actual=await page.evaluate(()=>{const e=(window as any).cinco.events.filter((e:any)=>e.kind==='action');return e.at(-1).action;});
 report.checks.push({kind:'ui-sequence',input:step.text,action:step.action,lastAction:actual,windows:state.windows,elapsedMs:Date.now()-start,pass:state.windows>0&&(actual===step.action||(step.action==='confirm'&&actual==='call'))});
 if(step.action==='celery'){
  const bar=page.locator('[aria-label="CINCO ID"] .titlebar');const before=await bar.boundingBox();await bar.dragTo(page.locator('.desktop'),{targetPosition:{x:900,y:100}});const after=await bar.boundingBox();report.checks.push({kind:'drag',pass:before?.x!==after?.x});await page.locator('[aria-label="CINCO ID"]').evaluate(e=>Object.assign((e as HTMLElement).style,{left:'520px',top:'12px'}));
 }
}
const recording=await page.evaluate(()=>(window as any).cinco.stopOutputCapture());await fs.writeFile(`benchmarks/${live?'live':'reference'}-audio.webm`,Buffer.from(recording,'base64'));
report.events=await page.evaluate(()=>(window as any).cinco.events);
report.media=await page.locator('video').evaluateAll(vs=>vs.map(v=>({src:v.src,readyState:v.readyState,currentTime:v.currentTime,error:v.error?.message})));
report.checks.push({kind:'video-playback',pass:report.media.every((v:any)=>v.readyState>=2&&!v.error)});
report.checks.push({kind:'audible-computer',pass:report.events.filter((e:any)=>e.kind==='audio-playing').length>=10});
report.checks.push({kind:'voice-playback-errors',pass:!report.events.some((e:any)=>e.kind==='voice-error')});
report.checks.push({kind:'console',pass:report.errors.length===0});
report.checks.push({kind:'generation-errors',pass:!report.events.some((e:any)=>/generation-error|media-error/.test(e.kind))});
if(live)report.checks.push({kind:'live-generated-assets',pass:report.events.filter((e:any)=>e.kind==='generated-ready').length>=6});
await page.close();await browser.close();
await fs.writeFile(`benchmarks/${live?'live':'reference'}-report.json`,JSON.stringify(report,null,2));
console.log(JSON.stringify({mode:report.mode,checks:report.checks.length,failures:report.checks.filter((x:any)=>!x.pass),errors:report.errors},null,2));
