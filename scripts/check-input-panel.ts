import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const output='output/input-panel';await fs.mkdir(output,{recursive:true});
// A deterministic microphone signal keeps these interaction checks offline.
const rate=48000,length=rate*5,wav=Buffer.alloc(44+length*2);
wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(length*2,40);
for(let i=0;i<length;i++)wav.writeInt16LE(Math.round(Math.sin(i/rate*440*Math.PI*2)*8000),44+i*2);
await fs.writeFile(`${output}/test-mic.wav`,wav);
const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${process.cwd()}/${output}/test-mic.wav`]});
const page=await browser.newPage({viewport:{width:1440,height:810},hasTouch:true}),errors:string[]=[];
const touch=await page.context().newCDPSession(page);
page.setDefaultTimeout(15000);
page.on('pageerror',error=>errors.push(error.message));
let transcriptions=0,failTranscription=false;
await page.route('**/api/**',async route=>{
 const url=route.request().url();
 if(url.endsWith('/transcribe/session'))return route.fulfill({status:503,json:{error:'Use recording fallback'}});
 if(url.endsWith('/transcribe')){
  transcriptions++;const body=route.request().postDataJSON();
  assert(Buffer.from(body.audio,'base64').length>1000);
  return route.fulfill({status:failTranscription?400:200,json:failTranscription?{error:'Microphone check failed'}:{text:'Pause.',requestId:body.requestId,transcriptionMs:1}});
 }
 if(url.endsWith('/command'))return route.fulfill({json:{action:'pause',response:''}});
 return route.fulfill({json:{}});
});
const record=page.locator('.record-button'),terminal=page.locator('[data-id="terminal"]');
try{
 await page.goto('http://127.0.0.1:5173');await page.evaluate(()=>(window as any).cinco.setSound(false));
 await page.getByRole('button',{name:'Start',exact:true}).click();await terminal.waitFor();
 assert.equal(await page.locator('.debug-bar,.touch-bar,.terminal-input,[aria-label="Computer command"]').count(),0);
 assert.equal(await page.locator('.terminal input,.terminal textarea,[contenteditable=true]').count(),0);
 assert.equal(await terminal.locator('.command-status').count(),1,'Activity belongs inside the original computer window');
 assert.match(await terminal.locator('.input-suggestion').innerText(),/Computer, load up Celery Man/);
 await terminal.locator('.content').click();await page.keyboard.type('Computer,resume.');await page.keyboard.press('Enter');
 assert.equal(await page.evaluate(()=>(window as any).cinco.events.filter((event:any)=>event.kind==='input'&&event.source==='keyboard').length),0);
 // Space must work even after the recording button has focus, without a second click on keyup.
 await record.focus();await page.keyboard.down('Space');
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording');
 assert.match(await record.innerText(),/Recording/);assert.equal(await page.locator('.record-hint').innerText(),'Release Space');
 await page.waitForTimeout(400);await page.keyboard.up('Space');
 await page.waitForFunction(()=>(window as any).cinco.events.some((event:any)=>event.kind==='input'&&event.source==='microphone'));
 assert.equal(transcriptions,1);assert.equal(await record.getAttribute('aria-pressed'),'false');
 // A real touch stays held, including when the finger slides off the button.
 await page.setViewportSize({width:390,height:844});
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('.desktop')?.clientHeight===844);
 const point=await record.boundingBox();assert(point);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x+point.width/2,y:point.y+point.height/2,id:1}]});
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording');
 assert.equal(await page.locator('.record-hint').innerText(),'Release to send');
 await page.screenshot({path:`${output}/mobile-recording.png`});
 await page.waitForTimeout(400);assert.equal(transcriptions,1,'Holding the button must not submit');
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:380,y:100,id:1}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>(window as any).cinco.events.filter((event:any)=>event.kind==='input'&&event.source==='microphone').length===2);
 assert.equal(transcriptions,2);
 // An OS-cancelled gesture and a quick tap must not leave the microphone latched on.
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x+point.width/2,y:point.y+point.height/2,id:2}]});
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording');
 await page.waitForTimeout(350);await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='idle');
 assert.equal(transcriptions,2,'Cancelled touch must not send a command');
 await record.tap();await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='idle');
 assert.equal(transcriptions,2,'Quick tap must not send a command');
 // The gear exposes mic selection; changing it updates the otherwise minimal strip.
 await page.getByRole('button',{name:'Microphone settings',exact:true}).click();
 const settings=page.getByRole('dialog',{name:'Microphone',exact:true}),select=settings.getByLabel('Microphone input');
 await select.selectOption({index:2});
 const selectedLabel=await select.locator('option:checked').innerText();
 assert.equal(await page.locator('.input-microphone').innerText(),selectedLabel);
 await page.keyboard.press('Escape');await settings.waitFor({state:'detached'});
 // Detailed failures remain available through the gear, with a compact indication in the footer.
 failTranscription=true;await record.hover();await page.mouse.down();
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording');
 await page.waitForTimeout(400);await page.mouse.move(380,100);await page.mouse.up();
 await page.waitForFunction(()=>document.querySelector('.input-activity')?.classList.contains('has-error'));
 await page.getByRole('button',{name:'Microphone settings',exact:true}).click();
 assert.equal(await settings.locator('.command-error').isVisible(),true);
 assert.equal(await settings.locator('.activity-details').getAttribute('open'),'');
 await settings.getByRole('button',{name:'Dismiss error'}).click();
 assert.equal(await page.locator('.input-activity').evaluate(element=>element.classList.contains('has-error')),false);
 assert.doesNotMatch(await page.locator('.command-status-label').innerText(),/Stopped/);
 assert.equal(await page.locator('.toast').count(),0,'Microphone errors stay in the input panel');
 await page.keyboard.press('Escape');
 // Keep the recording controls reachable at narrow widths and in landscape.
 for(const [width,height] of [[320,568],[844,390],[390,844]]){
  await page.setViewportSize({width,height});
  await page.waitForFunction(({width,height})=>{const desktop=document.querySelector<HTMLElement>('.desktop')!;return desktop.clientWidth===width&&desktop.clientHeight===height;},{width,height});
  const box=await record.boundingBox();
  assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,JSON.stringify({width,height,box}));
  assert(box.height>=44,'Mobile record control must have a touch-sized target');
 }
 await page.setViewportSize({width:1440,height:810});
 await page.evaluate(async()=>{const app=(window as any).cinco;app.setMode('reference');await app.apply({action:'resume',response:''});await app.apply({action:'celery',response:''});});
 await page.locator('.portrait video').waitFor();await page.locator('.portrait video').evaluate((video:HTMLVideoElement)=>video.play());
 assert.equal(await page.locator('.input-controls').count(),1,'Sequence changes retain one input strip');
 const bounds=await terminal.boundingBox();assert(bounds);assert.equal(Math.round(bounds.width),543);assert.equal(Math.round(bounds.height),152);
 await page.screenshot({path:`${output}/desktop.png`});await terminal.screenshot({path:`${output}/computer.png`});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${output}/mobile.png`});
 assert.deepEqual(errors,[]);
 console.log('Input panel passed: reference geometry, inline suggested line, no typed commands/debug bar, Space/mouse/touch hold-to-record, release outside, cancellation, quick taps, mic selection, errors, and responsive controls.');
}finally{await browser.close();}
