import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
const page=await browser.newPage({viewport:{width:1440,height:810}});
const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
let uploads=0,failUpload=false;
await page.route('**/api/**',async route=>{
 if(route.request().url().endsWith('/profile')){
  uploads++;assert.match(route.request().postDataJSON().image,/^\/9j\//,'Photos must be encoded as JPEG');
  await route.fulfill({status:failUpload?500:200,json:failUpload?{error:'Try again'}:{id:'test-identity'}});
 }else await route.fulfill({json:{}});
});
await page.routeWebSocket('**',ws=>ws.close());
await page.addInitScript(()=>{
 const media=navigator.mediaDevices,open=media.getUserMedia.bind(media);
 const calls:MediaStreamConstraints[]=[],streams:MediaStream[]=[];
 const clickSounds:{first:number;second:number;gap:number}[]=[];
 Object.assign(window,{mediaCalls:calls,mediaStreams:streams,denyMicrophone:false,clickSounds,openingFlashes:0});
 document.addEventListener('animationstart',event=>{if(event.animationName==='identity-open')(window as any).openingFlashes++;});
 const startBuffer=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args:Parameters<typeof startBuffer>){
  if(this.buffer&&Math.abs(this.buffer.duration-.16)<.001){
   const samples=this.buffer.getChannelData(0),rate=this.buffer.sampleRate;
   clickSounds.push({
    first:Math.max(...samples.slice(0,Math.floor(.045*rate)).map(Math.abs)),
    second:Math.max(...samples.slice(Math.floor(.085*rate),Math.floor(.13*rate)).map(Math.abs)),
    gap:Math.max(...samples.slice(Math.floor(.05*rate),Math.floor(.08*rate)).map(Math.abs)),
   });
  }
  return startBuffer.apply(this,args);
 };
 media.getUserMedia=async constraints=>{calls.push(constraints);if(constraints?.audio&&(window as any).denyMicrophone)throw new DOMException('Permission denied','NotAllowedError');const stream=await open(constraints);streams.push(stream);return stream;};
});
const mediaCalls=()=>page.evaluate(()=>(window as any).mediaCalls as MediaStreamConstraints[]);
const cameraStopped=()=>page.waitForFunction(()=>(window as any).mediaStreams.every((stream:MediaStream)=>stream.getVideoTracks().every(t=>t.readyState==='ended')));
const dialog=page.getByRole('dialog',{name:'New identity'});
try{
 await fs.mkdir('output/identity-launcher',{recursive:true});
 await page.goto('http://127.0.0.1:5173');
 await page.waitForFunction(()=>document.querySelectorAll('.identity-icon svg image').length===4);
 const bitmap=await page.locator('.identity-icon svg image').first().getAttribute('href');
 assert(bitmap?.startsWith('data:image/png;base64,'),'Preset portraits must render from processed photos');
 const bitmapInfo=await page.evaluate(async source=>{
  const img=new Image();img.src=source!;await img.decode();
  const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0);
  const pixels=ctx.getImageData(0,0,img.width,img.height).data,colors=new Set<string>();
  for(let i=0;i<pixels.length;i+=4)colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);
  return {width:img.width,height:img.height,colors:colors.size};
 },bitmap);
 assert.equal(bitmapInfo.width,24);assert.equal(bitmapInfo.height,32);
 assert(bitmapInfo.colors>4&&bitmapInfo.colors<=16,'Portrait must use the indexed bitmap palette');
 assert.equal((await mediaCalls()).length,0);
 assert.equal(await page.getByLabel('Experience',{exact:true}).count(),0);
 assert.equal(await page.getByLabel('Microphone input').count(),0);
 assert.equal(await page.locator('.launch .buttons button').count(),1);
 assert.equal((await page.locator('.launch .content').innerText()).replace(/\s+/g,' ').trim(),'Identity Paul Rudd Thomas Dimson Ian Silber Joey Flynn Upload Start');
 await page.getByRole('button',{name:'Thomas Dimson',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Thomas Dimson',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal(await page.evaluate(()=>(window as any).cinco.state().started),false,'Single click only selects an identity');
 await page.screenshot({path:'output/identity-launcher/desktop.png'});
 await page.locator('.launch').screenshot({path:'output/identity-launcher/compact-picker.png'});
 await page.getByRole('button',{name:'Upload',exact:true}).click();
 assert.equal(await dialog.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Your name',{exact:true}).fill('  ');
 await dialog.getByLabel('Upload identity photo').setInputFiles('reference/thomas-dimson.jpg');
 await dialog.getByText('Photo ready. Add your name, then save.',{exact:true}).waitFor();
 assert.equal(uploads,0,'Choosing a photo does not save it');
 assert.equal(await dialog.getByRole('button',{name:'Save',exact:true}).isDisabled(),true);
 await dialog.getByLabel('Your name',{exact:true}).fill('  My identity  ');
 await page.screenshot({path:'output/identity-launcher/upload.png'});
 failUpload=true;await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await dialog.getByText('Could not save: Try again',{exact:true}).waitFor();
 assert.equal(await dialog.getByRole('button',{name:'Save',exact:true}).isEnabled(),true);
 failUpload=false;await dialog.getByRole('button',{name:'Save',exact:true}).click();
 await dialog.waitFor({state:'detached'});
 assert.equal(await page.getByRole('button',{name:'My identity',exact:true}).getAttribute('aria-pressed'),'true');
 await page.reload();await page.getByRole('button',{name:'My identity',exact:true}).waitFor();
 assert.match(await page.getByRole('button',{name:'My identity',exact:true}).locator('svg image').getAttribute('href')||'',/^data:image\/png;base64,/,'Uploaded photo icon must survive reload');
 await page.getByRole('button',{name:'Upload',exact:true}).click();
 await dialog.getByRole('button',{name:'Use camera',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.take-photo')?.disabled);
 assert.equal((await mediaCalls()).every(c=>c.audio===false),true,'Camera must not request microphone access');
 await dialog.getByRole('button',{name:'Take photo',exact:true}).click();await cameraStopped();
 assert.equal(await dialog.getByRole('button',{name:'Save',exact:true}).isDisabled(),true,'Camera photos also require a name');
 await dialog.getByLabel('Your name',{exact:true}).fill('Camera identity');
 await dialog.getByRole('button',{name:'Save',exact:true}).click();await dialog.waitFor({state:'detached'});
 await page.getByRole('button',{name:'Upload',exact:true}).click();await dialog.getByRole('button',{name:'Use camera',exact:true}).click();
 await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.take-photo')?.disabled);
 await dialog.getByRole('button',{name:'Close window',exact:true}).click();await cameraStopped();
 assert.equal(await page.getByRole('button',{name:'Camera identity',exact:true}).getAttribute('aria-pressed'),'true');
 // Compact screens keep the windows reachable and allow all form controls to scroll into view.
 for(const [width,height] of [[390,844],[320,568],[844,390]]){
  await page.setViewportSize({width,height});
  await page.locator('.launch .start').scrollIntoViewIfNeeded();
  await page.screenshot({path:`output/identity-launcher/mobile-${width}.png`});
  await page.getByRole('button',{name:'Upload',exact:true}).click();
  const bounds=await dialog.boundingBox();assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width&&bounds.y>=0&&bounds.y+bounds.height<=height);
  await dialog.getByLabel('Your name',{exact:true}).fill('Mobile');
  await dialog.getByRole('button',{name:'Cancel',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:`output/identity-launcher/mobile-upload-${width}.png`});
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click();
 }
 await page.setViewportSize({width:1440,height:810});
 await page.evaluate(()=>{(window as any).denyMicrophone=true;(window as any).cinco.setSound(false);});
 await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.waitForFunction(()=>(window as any).cinco.state().started);
 await page.waitForFunction(()=>(window as any).mediaCalls.some((c:MediaStreamConstraints)=>!!c.audio));
 assert((await mediaCalls()).some(c=>!!c.audio),'Start prepares the microphone without blocking on permission');
 assert.equal(await page.locator('.launch').count(),0);
 // A blocked mic turns the input toward typing instead of an error window.
 const field=page.getByRole('textbox',{name:'Type a command',exact:true});
 await page.waitForFunction(()=>document.querySelector<HTMLInputElement>('.command-input')?.placeholder.includes('Mic blocked'));
 assert.match(await page.locator('.input-suggestion').innerText(),/^Suggestion: Type “/,'The suggestion still shows, worded for typing');
 await page.locator('[data-id="terminal"] .content').click();await page.keyboard.press('Space');
 assert(await field.evaluate(el=>el===document.activeElement),'Space moves into the field when the mic is blocked');
 assert.equal(await page.locator('.input-settings').count(),0);
 await field.blur();
 assert.equal(await page.evaluate(()=>localStorage.getItem('cinco-name')),'Camera identity');
 await page.evaluate(()=>(window as any).cinco.reset());
 await page.getByRole('button',{name:'Camera identity',exact:true}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Camera identity',exact:true}).getAttribute('aria-pressed'),'true');
 await page.evaluate(()=>{(window as any).denyMicrophone=false;});
 await page.getByRole('button',{name:'Start',exact:true}).click();await page.waitForFunction(()=>(window as any).cinco.state().started);await cameraStopped();
 await page.keyboard.press('F1');await page.locator('.dock').getByRole('button',{name:'Identity',exact:true}).click();
 const beforeKeyboard=await mediaCalls();await page.getByRole('button',{name:'Thomas Dimson',exact:true}).focus();await page.keyboard.press('Space');
 assert.equal(await page.getByRole('button',{name:'Thomas Dimson',exact:true}).getAttribute('aria-pressed'),'true');
 assert.equal((await mediaCalls()).length,beforeKeyboard.length,'Keyboard selection must not record audio');
 await page.getByRole('button',{name:'Upload',exact:true}).click();await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});
 assert.equal(await page.locator('.dock').isVisible(),true,'Closing the photo dialog must not toggle command controls');
 // Double-clicking an unselected preset or saved photo selects and starts it once.
 for(const [label,profile] of [['Paul Rudd','paul'],['Camera identity','test-identity']]){
  await page.evaluate(()=>(window as any).cinco.reset());
  await page.evaluate(enabled=>(window as any).cinco.setSound(enabled),profile==='paul');
  const bootCount=await page.evaluate(()=>(window as any).cinco.events.filter((event:any)=>event.kind==='input'&&event.source==='boot').length);
  await page.getByRole('button',{name:label,exact:true}).dblclick();
  await page.waitForFunction(()=>(window as any).cinco.state().started);
  await cameraStopped();
  assert.equal(await page.evaluate(()=>(window as any).cinco.state().profile),profile);
  assert.equal(await page.locator('.launch').count(),0);
  assert.equal(await page.evaluate(()=>(window as any).cinco.events.filter((event:any)=>event.kind==='input'&&event.source==='boot').length),bootCount+1,'Double click must start only once');
 }
 const feedback=await page.evaluate(()=>({sounds:(window as any).clickSounds as {first:number;second:number;gap:number}[],flashes:(window as any).openingFlashes}));
 assert.equal(feedback.sounds.length,1,'Only the unmuted double click should play sound');
 assert(feedback.sounds[0].first>.02&&feedback.sounds[0].second>.02,'Both mechanical clicks must be audible');
 assert.equal(feedback.sounds[0].gap,0,'The two clicks must be distinct');
 assert.equal(feedback.flashes,2,'Both double clicks should flash the selected caption');
 assert.deepEqual(errors,[]);
 console.log('Identity launcher passed: compact chooser, single-click selection, double-click preset/custom start, Start button, upload retry, saved identity, camera cleanup, responsive windows, and microphone permission handling.');
}finally{await browser.close();}
