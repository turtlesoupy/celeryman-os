import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const dir=await mkdtemp(join(tmpdir(),'celery-recording-'));
const file=join(dir,'microphone.wav'),rate=48000,length=rate*5,wav=Buffer.alloc(44+length*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*2,40);
for(let i=0;i<length;i++)wav.writeInt16LE(Math.round(12000*Math.sin(2*Math.PI*440*i/rate)),44+i*2);
await writeFile(file,wav);
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${file}`]});
try{
 const page=await browser.newPage({permissions:['microphone']});await page.addInitScript('window.__name = value => value;');let fallback=0;
 await page.routeWebSocket('**',socket=>socket.close());
 await page.route('**/api/**',async route=>{
  if(route.request().url().endsWith('/transcribe/session'))return route.fulfill({status:503,json:{error:'offline'}});
  if(route.request().url().endsWith('/transcribe')){
   fallback++;const body=route.request().postDataJSON();assert(Buffer.from(body.audio,'base64').length>1000);
   return route.fulfill({json:{text:'Pause',requestId:body.requestId,transcriptionMs:1}});
  }
  return route.fulfill({json:{}});
 });
 await page.addInitScript(()=>{
  // Even a streaming module that never loads must not delay local recording.
  Worklet.prototype.addModule=()=>new Promise(()=>{});
  const open=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia=async constraints=>{await new Promise(resolve=>setTimeout(resolve,300));return open(constraints);};
 });
 await page.goto('http://127.0.0.1:5173');await page.evaluate(()=>(window as any).cinco.setSound(false));
 await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.keyboard.down('Space');
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='opening');
 assert.equal(await page.locator('.record-hint').innerText(),'Wait for mic');
 assert.match(await page.locator('.record-button').getAttribute('aria-label')||'',/wait to speak/);
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording',null,{timeout:2000});
 const ready=await page.evaluate(()=>(window as any).cinco.events.find((e:any)=>e.kind==='microphone-ready'));
 assert(ready.openingMs<1500,'Optional worklet must not delay recording');
 await page.waitForTimeout(1500);await page.keyboard.up('Space');
 try{await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.action==='pause'),null,{timeout:5000});}catch(error){console.log(await page.evaluate(()=>(window as any).cinco.events));throw error;}
 assert.equal(fallback,1);
 console.log('PASS: waiting/ready indicators and complete file capture while streaming worklet is unavailable');
}finally{await browser.close();await rm(dir,{recursive:true,force:true});}
