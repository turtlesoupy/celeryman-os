import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import ffprobe from 'ffprobe-static';
import ffmpeg from 'ffmpeg-static';
const useWebKit=process.env.EXPORT_BROWSER==='webkit';
const browser=await (useWebKit?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']}));
await fs.mkdir('output/video-export',{recursive:true});
try{
 const page=await browser.newPage();page.on('pageerror',e=>console.error(e));page.on('console',m=>{if(m.type()==='error')console.error(m.text());});await page.route('**/@vite/client',route=>route.fulfill({contentType:'application/javascript',body:'export const createHotContext=()=>({accept(){},prune(){},dispose(){},on(){},send(){}});export const updateStyle=(id,css)=>{const s=document.createElement("style");s.textContent=css;document.head.append(s)};export const removeStyle=()=>{};'}));await page.goto('http://127.0.0.1:5173/');
 for(const [width,height] of [[282,502],[620,330]]){
  await page.evaluate(async({width,height})=>{
   const {installVideoSave}=await import('/src/video-export.ts' as string);
   document.querySelector('.desktop')!.innerHTML=`<section class="window" style="width:${width}px;height:${height}px;left:10px;top:10px" aria-label="CINCO ID"><header class="titlebar"><div class="sys"></div><span>CINCO ID</span><button class="close">Close</button><button class="min"></button><button class="max"></button></header><div class="menu-line"></div><div class="content"><video muted playsinline src="/media/motion/celery-5s.mp4"></video></div><div class="bottom-edge"></div></section>`;
   const win=document.querySelector<HTMLElement>('.window')!,v=win.querySelector('video')!;v.dataset.musicSource='/media/original/music-celery.wav';v.playbackRate=2;
   win.querySelector('.close')!.addEventListener('click',()=>win.remove());
   win.addEventListener('videoexport',(event:any)=>{(window as any).exportTiming=event.detail;});
   installVideoSave(win,v,(message:string)=>{(window as any).exportMessage=message;if(message!=='Saved video with its audio loop.')console.error(message);});
   await new Promise<void>(resolve=>{v.onloadeddata=()=>resolve();if(v.readyState>=2)resolve();});v.playbackRate=width===282?1:2;
  },{width,height});
  const began=performance.now();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save video with audio'}).click();
  const file=await download,path=`output/video-export/${width}x${height}.${file.suggestedFilename().split('.').pop()}`;await file.saveAs(path);
  assert.equal(await page.locator('.window').count(),1,'Save does not close window');
  const probe=JSON.parse(execFileSync(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'}));
  const video=probe.streams.find((s:any)=>s.codec_type==='video'),audio=probe.streams.find((s:any)=>s.codec_type==='audio');assert(video&&audio,'Both media tracks present');
  const pad=Math.round(Math.min(width,height)*.04);assert(Math.abs(video.width/video.height-(width+pad*2)/(height+pad*2))<.01);
  const expected=width===282?5.005:2.5025;assert(Math.abs(Number(video.duration||probe.format.duration)-expected)<.15,'Export respects playback speed');
  const hashes=execFileSync(ffmpeg!,['-v','error','-i',path,'-map','0:v:0','-f','framemd5','-'],{encoding:'utf8'}).split('\n').filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').at(-1));
  assert(new Set(hashes).size>30,'Encoded video contains moving frames');
  const pcm=execFileSync(ffmpeg!,['-v','error','-i',path,'-map','0:a:0','-f','f32le','-ac','1','-']);let peak=0;for(let i=0;i<pcm.length;i+=4)peak=Math.max(peak,Math.abs(pcm.readFloatLE(i)));assert(peak>.01,'Soundtrack is audible');
  execFileSync(ffmpeg!,['-v','error','-y','-i',path,'-frames:v','1',`output/video-export/${width}x${height}.png`]);
  const timing=await page.evaluate(()=>(window as any).exportTiming);
  console.log(`${width}x${height}: ${video.width}x${video.height}, ${probe.format.duration}s, audio peak ${peak.toFixed(3)}, export ${JSON.stringify(timing)}, click-to-verified ${Math.round(performance.now()-began)}ms`);
  assert.equal(timing.path,'webcodecs','Modern browser uses direct encoding');
  const repeat=await page.evaluate(async()=>{
   const {exportVideoWindow}=await import('/src/video-export.ts' as string),win=document.querySelector<HTMLElement>('.window')!,v=win.querySelector('video')!,start=performance.now();
   const blob=await exportVideoWindow(win,v,new AbortController().signal);return {ms:performance.now()-start,size:blob.size};
  });assert(repeat.ms<200,'Repeated export uses cached result');assert.equal(repeat.size,timing.bytes);
  if(width===282){
   const baseline=await page.evaluate(async()=>{
    const {exportVideoWindow}=await import('/src/video-export.ts' as string),win=document.querySelector<HTMLElement>('.window')!,v=win.querySelector('video')!,start=performance.now();
    await exportVideoWindow(win,v,new AbortController().signal,()=>{},true);return performance.now()-start;
   });console.log(`Recorder baseline ${Math.round(baseline)}ms; direct ${Math.round(timing.elapsedMs)}ms; cached ${repeat.ms.toFixed(1)}ms`);
  }
 }
 // Missing audio must fail visibly instead of producing a silent download.
 await page.route('**/missing-export-audio.wav',route=>route.fulfill({status:404,body:'Missing'}));
 await page.evaluate(()=>{document.querySelector('video')!.dataset.musicSource='/missing-export-audio.wav';});
 await page.getByRole('button',{name:'Save video with audio'}).click();await page.waitForFunction(()=>(window as any).exportMessage?.includes('Audio unavailable'));
 assert.equal(await page.getByRole('button',{name:'Save video with audio'}).isEnabled(),true);
 await page.evaluate(()=>{document.querySelector('video')!.dataset.musicSource='/media/original/music-celery.wav';});
 const lifecycle=await page.evaluate(async()=>{
  const {exportVideoWindow}=await import('/src/video-export.ts' as string),win=document.querySelector<HTMLElement>('.window')!,v=win.querySelector('video')!;
  win.style.width='400px';
  const controller=new AbortController();setTimeout(()=>controller.abort(),15);
  let aborted=false;try{await exportVideoWindow(win,v,controller.signal);}catch{aborted=controller.signal.aborted;}
  const blob=await exportVideoWindow(win,v,new AbortController().signal);
  const check=document.createElement('video'),url=URL.createObjectURL(blob);check.src=url;
  await new Promise<void>((resolve,reject)=>{check.onloadedmetadata=()=>resolve();check.onerror=()=>reject(Error('Unreadable retry'));});
  const result={aborted,width:check.videoWidth,height:check.videoHeight};check.removeAttribute('src');check.load();URL.revokeObjectURL(url);return result;
 });assert(lifecycle.aborted,'Cancellation interrupts encoding');assert.equal(lifecycle.width,852,'Resizing invalidates cached composition');assert.equal(lifecycle.height,712);
 console.log('Passed: portrait and landscape composition, audio, speed, cache reuse/invalidation, cancellation/retry, recorder fallback, failure recovery.');
}finally{await browser.close();}
