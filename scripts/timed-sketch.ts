import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {sketch,scripted} from '../src/protocol';
const mode=process.argv.includes('--reference')?'reference':'live';
const directory=`benchmarks/timed-${mode}`;await fs.mkdir(directory,{recursive:true});
const manifest=JSON.parse(await fs.readFile('benchmarks/voice-inputs/manifest.json','utf8')) as number[][];
// Real speech recognition is measured first, then its actual transcript is delivered at
// the sketch's response time. This separates visual/audio timing from provider latency.
const transcripts:Record<number,{text:string;elapsedMs:number}>={};
await Promise.all(manifest.map(async([i])=>{const start=Date.now();const audio=(await fs.readFile(`benchmarks/voice-inputs/${String(i).padStart(2,'0')}.wav`)).toString('base64');const r=await fetch('http://127.0.0.1:5173/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio,mime:'audio/wav'})});const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));transcripts[i]={text:data.text,elapsedMs:Date.now()-start};}));
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const page=await browser.newPage({viewport:{width:1920,height:1080},recordVideo:{dir:directory,size:{width:1920,height:1080}}});
await page.routeWebSocket('**',ws=>ws.close());const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5173');
await page.evaluate(m=>{(window as any).cinco.setIdentity('paul','Paul');(window as any).cinco.setMode(m);},mode);
await page.evaluate(()=>(window as any).cinco.startOutputCapture());
const origin=Date.now();const at=async(seconds:number)=>{await new Promise(r=>setTimeout(r,Math.max(0,origin+seconds*1000-Date.now())));};
const snapshots:[number,string][]=[[9.65,'celery'],[25.15,'engaged'],[30.65,'oyster'],[47.65,'intro'],[52.65,'tayne'],[57.65,'squat'],[61.65,'hat'],[65.25,'flar'],[72.45,'nsfw'],[82.65,'call'],[89.65,'chaos']];
const screens=snapshots.map(async([time,name])=>{await at(time);await page.screenshot({path:`${directory}/${name}.png`});return {name,time,actual:(Date.now()-origin)/1000,windows:await page.locator('.window').evaluateAll(ws=>ws.map(w=>({label:w.getAttribute('aria-label'),x:(w as HTMLElement).offsetLeft,y:(w as HTMLElement).offsetTop,w:(w as HTMLElement).offsetWidth,h:(w as HTMLElement).offsetHeight})))};});
const inputs=sketch.map(async(step,i)=>{
 if('keyboard'in step){await at(27.85);await page.locator('[data-id="terminal"] .content').click();await page.getByRole('textbox',{name:'Terminal command',exact:true}).pressSequentially(step.text,{delay:90});await at(step.at);await page.keyboard.press('Enter');return {i,text:step.text,scheduled:step.at,delivered:(Date.now()-origin)/1000};}
 await at(step.at);const delivered=(Date.now()-origin)/1000;const text=i===0?step.text:transcripts[i].text;const result=await page.evaluate(t=>(window as any).cinco.dispatch(t,'timed-real-transcript'),text);return {i,text,scheduled:step.at,delivered,completed:(Date.now()-origin)/1000,actual:result?.action,expected:step.action};
});
const inputResults=await Promise.all(inputs);const screenshotResults=await Promise.all(screens);await at(94);
const capture=await page.evaluate(()=>(window as any).cinco.stopOutputCapture());await fs.writeFile(`${directory}/output-audio.webm`,Buffer.from(capture,'base64'));
const events=await page.evaluate(()=>(window as any).cinco.events);
const report={mode,started:new Date(origin).toISOString(),method:'Real STT transcripts scheduled at exact source response offsets, cached generated Paul videos. Provider cold-start latency is measured separately in the live/generalization benchmarks. This is not a claim of zero generation latency.',transcripts,inputs:inputResults,snapshots:screenshotResults,events,errors,checks:[{kind:'all-sketch-inputs',pass:inputResults.length===17&&inputResults.every(r=>!('expected'in r)||r.actual===r.expected)},{kind:'schedule-jitter-under-150ms',pass:inputResults.every(r=>Math.abs(r.delivered-r.scheduled)<.15)},{kind:'live-generated-only',pass:mode==='reference'||events.filter((e:any)=>e.kind==='generated-ready').every((e:any)=>e.url.includes('/generated/'))},{kind:'no-runtime-errors',pass:errors.length===0&&!events.some((e:any)=>/error/.test(e.kind))},{kind:'virtual-printer',pass:events.some((e:any)=>e.kind==='print-spooled')},{kind:'emergency-call',pass:events.some((e:any)=>e.action==='call')}]};
await fs.writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await page.close();await browser.close();console.log(JSON.stringify(report.checks,null,2));
