import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const dir='benchmarks/transcription-control-20261005';await fs.mkdir(dir,{recursive:true});
const recording=`${process.cwd()}/analysis/celery-transcription-control.wav`;
execFileSync('ffmpeg',['-y','-v','error','-i','benchmarks/voice-inputs/01.wav','-af','adelay=500,apad=pad_dur=1','-ar','48000','-ac','1',recording]);
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${recording}`]});
const report:any[]=[];
try{
 for(const streaming of [false,true]){
  const page=await browser.newPage({permissions:['microphone']});let sessions=0,files=0,pcmBytes=0;const errors:string[]=[],generated:any[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',req=>{if(req.url().endsWith('/api/transcribe/session'))sessions++;if(req.url().endsWith('/api/transcribe'))files++;});
  page.on('websocket',socket=>socket.on('framesent',frame=>{const data=JSON.parse(String(frame.payload));if(data.type==='input_audio_buffer.append')pcmBytes+=Buffer.from(data.audio,'base64').length;}));
  await page.route('**/api/warm',route=>route.fulfill({json:{ok:true}}));
  await page.route('**/api/generate',route=>{generated.push(route.request().postDataJSON());return route.fulfill({json:{id:'fixture',status:'complete',url:'/media/original/celery.mp4'}});});
  await page.goto(`http://127.0.0.1:5173/?fastPath=1${streaming?'&streamingTranscription=1':''}`);
  await page.evaluate(()=>(window as any).cinco.setSound(false));
  await page.getByRole('button',{name:'Start',exact:true}).click();await page.locator('.launch').waitFor({state:'detached'});
  if(streaming)await page.waitForTimeout(1500);
  await page.keyboard.down('Space');
  await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording');
  await page.waitForTimeout(2600);await page.keyboard.up('Space');
  await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='transcription'),null,{timeout:20000});
  await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.action==='celery'),null,{timeout:15000});
  const events=await page.evaluate(()=>(window as any).cinco.events);
  const row={streaming,sessions,files,pcmMs:pcmBytes/48,transcript:events.find((e:any)=>e.kind==='transcription'),capture:events.find((e:any)=>e.kind==='microphone-capture'),generated,errors};
  report.push(row);console.log(JSON.stringify(row));
  assert.deepEqual(errors,[]);assert.equal(generated.length,2);assert(generated.every(r=>r.fastPath===true));
  if(!streaming){assert.equal(sessions,0);assert.equal(files,1);assert.notEqual(row.transcript.model,'gpt-live-transcribe');}
  else{assert.equal(sessions,1);assert(pcmBytes>0);}
  await page.close();
 }
}finally{await browser.close();await fs.writeFile(dir+'/comparison.json',JSON.stringify(report,null,2));}
