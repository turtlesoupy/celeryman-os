import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
await fs.mkdir('benchmarks/generalization',{recursive:true});
// A real WAV is supplied to Chromium's capture device; MediaRecorder and STT remain real.
execFileSync('say',['-v','Samantha','-r','165','-o','analysis/friend-command.aiff','Computer, show me a shoulder shimmy in a mustard yellow tracksuit.']);
execFileSync('ffmpeg',['-y','-i','analysis/friend-command.aiff','-ar','48000','-ac','1','analysis/friend-command.wav','-loglevel','error']);
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${path.resolve('analysis/friend-command.wav')}`]});
const page=await browser.newPage({viewport:{width:1440,height:810},permissions:['microphone'],recordVideo:{dir:'benchmarks/generalization/recordings'}});page.setDefaultTimeout(300000);
const report:any={started:new Date().toISOString(),identity:'Thomas Dimson uploaded via file chooser',checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
// Keep Vite's normal browser connection enabled: media generation must not reload the app.
let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
try {
await page.goto('http://127.0.0.1:5173');
const picker=page.waitForEvent('filechooser');await page.getByLabel('Identity',{exact:true}).selectOption('upload');await(await picker).setFiles('reference/thomas-dimson.jpg');
await page.waitForFunction(()=>(window as any).cinco.state().profile.length>20);
await page.evaluate(()=>(window as any).cinco.startOutputCapture());
await page.getByLabel('Your name',{exact:true}).fill('Thomas');await page.getByText('Start computer',{exact:true}).click();await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='audio-playing'&&e.text.startsWith('Good morning')));await page.waitForTimeout(4700);
const state=await page.evaluate(()=>(window as any).cinco.state());report.profile=state.profile;
report.checks.push({kind:'arbitrary-upload',pass:!['paul','thomas'].includes(state.profile)});
await page.keyboard.down('Space');await page.waitForTimeout(Number(execFileSync('ffprobe',['-v','quiet','-show_entries','format=duration','-of','csv=p=0','analysis/friend-command.wav']).toString())*1000+600);await page.keyboard.up('Space');
await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='generated-ready'),{},{timeout:300000});
await page.waitForTimeout(1000);await page.screenshot({path:'benchmarks/generalization/01-shoulder-shimmy.png'});
let events=await page.evaluate(()=>(window as any).cinco.events);
report.checks.push({kind:'microphone-to-STT-to-LLM-to-video',pass:events.some((e:any)=>e.kind==='input'&&e.source==='microphone')&&events.some((e:any)=>e.kind==='generated-ready'),transcript:events.find((e:any)=>e.kind==='transcription')?.text});
const commands=['Now give him a tiny backwards shuffle while keeping the yellow tracksuit.','Could I see a hat wobble, but wearing a tall purple top hat and wobbling twice as slowly?','Print a smiling portrait.'];
for(const[i,text]of commands.entries()){
 await page.keyboard.press('F1');await page.getByRole('textbox',{name:'Computer command'}).fill(text);await page.getByRole('textbox',{name:'Computer command'}).press('Enter');
 await page.waitForFunction(t=>(window as any).cinco.events.some((e:any)=>e.kind==='input'&&e.text===t),text);await page.waitForFunction(t=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.text===t),text,{timeout:300000});
 await page.waitForFunction(()=>!document.querySelector('[data-id="loader"]'),{},{timeout:300000});await page.keyboard.press('Escape');await page.waitForTimeout(1500);
 await page.screenshot({path:`benchmarks/generalization/0${i+2}.png`});
}
report.events=await page.evaluate(()=>(window as any).cinco.events);report.final=await page.evaluate(()=>(window as any).cinco.state());
report.checks.push({kind:'generation-does-not-reload-page',pass:navigations===1,navigations});
report.checks.push({kind:'novel-motion-generation',pass:report.events.filter((e:any)=>e.kind==='generated-ready').length>=3});
report.checks.push({kind:'no-reference-dancer-assets',pass:report.events.filter((e:any)=>e.kind==='generated-ready').every((e:any)=>e.url.includes('/generated/'))});
report.checks.push({kind:'no-runtime-errors',pass:report.errors.length===0&&!report.events.some((e:any)=>/error/.test(e.kind))});
const captured=await page.evaluate(()=>(window as any).cinco.stopOutputCapture());await fs.writeFile('benchmarks/generalization/output-audio.webm',Buffer.from(captured,'base64'));
} catch(error) { report.errors.push(String(error)); report.events=await page.evaluate(()=>(window as any).cinco.events).catch(()=>[]); } finally { await fs.writeFile('benchmarks/generalization/report.json',JSON.stringify(report,null,2)); await page.close(); await browser.close(); } console.log(JSON.stringify({checks:report.checks,errors:report.errors},null,2)); if(report.errors.length)process.exitCode=1;
