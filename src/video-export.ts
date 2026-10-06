import {downloadBlob,shareableFile,shareFile} from './save-media';
import {loopBuffer,preloadAudio,speechBus} from './audio';

// Snapshot layout once: moving or resizing the live window cannot distort an export.
function composition(win:HTMLElement,video:HTMLVideoElement){
 const outer=win.getBoundingClientRect(),scale=outer.width/win.offsetWidth;
 const width=win.offsetWidth,height=win.offsetHeight,pad=Math.round(Math.min(width,height)*.04);
 const canvas=document.createElement('canvas');
 const resolution=Math.min(2,1920/Math.max(width+pad*2,height+pad*2));
 canvas.width=Math.ceil((width+pad*2)*resolution/2)*2;canvas.height=Math.ceil((height+pad*2)*resolution/2)*2;
 const ctx=canvas.getContext('2d')!;
 ctx.scale(canvas.width/(width+pad*2),canvas.height/(height+pad*2));
 const rect=(el:Element)=>{const r=el.getBoundingClientRect();return {x:(r.left-outer.left)/scale+pad,y:(r.top-outer.top)/scale+pad,w:r.width/scale,h:r.height/scale};};
 const fill=(color:string,x:number,y:number,w:number,h:number)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
 fill('#01b2ce',0,0,width+pad*2,height+pad*2);
 // Give the export's site address room without changing the live Save button.
 const save=win.querySelector<HTMLElement>('.titlebar>.close')!,title=win.querySelector<HTMLElement>('.titlebar>span')!;
 const saveStyle=getComputedStyle(save),address='celeryman.fun';
 ctx.font=`${saveStyle.fontWeight} ${saveStyle.fontSize} ${saveStyle.fontFamily}`;
 const extra=Math.min(Math.max(0,ctx.measureText(address).width+12-rect(save).w),Math.max(0,rect(title).w-24));
 for(const el of [win,...win.querySelectorAll<HTMLElement>('.titlebar,.titlebar>*,.menu-line,.content,.bottom-edge')]){
  const r=rect(el),s=getComputedStyle(el);if(!r.w||!r.h)continue;
  if(el===save){r.x-=extra;r.w+=extra;}else if(el===title)r.w-=extra;
  fill(s.backgroundColor,r.x,r.y,r.w,r.h);
  if(s.backgroundImage.includes('linear-gradient')){const g=ctx.createLinearGradient(0,r.y,0,r.y+r.h);g.addColorStop(0,'#152482');g.addColorStop(1,'#182ab1');ctx.fillStyle=g;ctx.fillRect(r.x,r.y,r.w,r.h);}
  fill(s.borderTopColor,r.x,r.y,r.w,parseFloat(s.borderTopWidth));fill(s.borderBottomColor,r.x,r.y+r.h-parseFloat(s.borderBottomWidth),r.w,parseFloat(s.borderBottomWidth));
  fill(s.borderLeftColor,r.x,r.y,parseFloat(s.borderLeftWidth),r.h);fill(s.borderRightColor,r.x+r.w-parseFloat(s.borderRightWidth),r.y,parseFloat(s.borderRightWidth),r.h);
  ctx.fillStyle=s.color;
  if(el.matches('.min,.max')){const cx=r.x+r.w/2,cy=r.y+r.h/2,d=el.matches('.min')?1:-1;ctx.beginPath();ctx.moveTo(cx-4,cy-d*2);ctx.lineTo(cx+4,cy-d*2);ctx.lineTo(cx,cy+d*3);ctx.fill();}
  else if(el.matches('.sys')){fill('#aaa',r.x+r.w/2-7,r.y+r.h/2-2,14,4);}
  else if(el.matches('.titlebar>span,.titlebar>button,.menu-line')){
   ctx.save();ctx.beginPath();ctx.rect(r.x+2,r.y,r.w-4,r.h);ctx.clip();ctx.font=`${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;ctx.textBaseline='middle';ctx.textAlign=el.matches('button')?'center':'left';
   const label=el===save?address:el.textContent||'';
   if(el===save){const size=parseFloat(s.fontSize)*Math.min(1,(r.w-8)/ctx.measureText(label).width);ctx.font=`${s.fontWeight} ${size}px ${s.fontFamily}`;}
   ctx.fillText(label,el.matches('button')?r.x+r.w/2:r.x+parseFloat(s.paddingLeft)+1,r.y+r.h/2);ctx.restore();
  }
 }
 const backdrop=document.createElement('canvas');backdrop.width=canvas.width;backdrop.height=canvas.height;backdrop.getContext('2d')!.drawImage(canvas,0,0);
 const vr=rect(video),cr=rect(win.querySelector('.content')!),fit=getComputedStyle(video).objectFit;
 return {canvas,draw(source:CanvasImageSource,sourceWidth:number,sourceHeight:number){
  ctx.drawImage(backdrop,0,0,width+pad*2,height+pad*2);
  ctx.save();ctx.beginPath();ctx.rect(cr.x,cr.y,cr.w,cr.h);ctx.clip();ctx.beginPath();ctx.rect(vr.x,vr.y,vr.w,vr.h);ctx.clip();
  let w=vr.w,h=vr.h;if(fit==='cover'||fit==='contain'){const factor=Math[fit==='cover'?'max':'min'](vr.w/sourceWidth,vr.h/sourceHeight);w=sourceWidth*factor;h=sourceHeight*factor;}
  ctx.drawImage(source,vr.x+(vr.w-w)/2,vr.y+(vr.h-h)/2,w,h);ctx.restore();
  for(let y=0;y<height+pad*2;y+=4.5)fill('#0000000e',0,y,width+pad*2,1.5);
 }};
}

type Progress=(message:string)=>void;
const exportsCache=new WeakMap<HTMLElement,{key:string;blob:Blob}>();
function cacheKey(win:HTMLElement,video:HTMLVideoElement){
 return JSON.stringify([video.currentSrc||video.src,video.dataset.musicSource,video.playbackRate,win.offsetWidth,win.offsetHeight,win.className,win.querySelector('.titlebar>span')?.textContent,win.querySelector('.menu-line')?.textContent,
  ...[win,...win.querySelectorAll<HTMLElement>('.titlebar,.titlebar>*,.menu-line,.content,video,.bottom-edge')].map(el=>{const s=getComputedStyle(el);return [el.offsetWidth,el.offsetHeight,s.backgroundColor,s.font,s.padding,s.objectFit,s.transform];})]);
}
export async function exportVideoWindow(win:HTMLElement,video:HTMLVideoElement,signal:AbortSignal,progress:Progress=()=>{},forceRecorder=false){
 signal.throwIfAborted();
 if(win.classList.contains('minimized'))throw Error('Restore the window before saving.');
 if(!video.dataset.musicSource)throw Error('This sequence has no soundtrack.');
 const key=cacheKey(win,video),cached=exportsCache.get(win);
 if(!forceRecorder&&cached?.key===key){progress('Ready');return cached.blob;}
 const started=performance.now();let blob:Blob|null=null,path='recorder';
 progress('Loading');
 if(!forceRecorder&&'VideoEncoder' in window&&'AudioEncoder' in window){
  const {encodeVideoWindow}=await import('./video-export-fast');
  blob=await encodeVideoWindow(composition(win,video),video.currentSrc||video.src,video.dataset.musicSource,video.playbackRate,signal,progress);
  if(blob)path='webcodecs';
 }
 if(!blob){progress('Recording');blob=await recordVideoWindow(win,video,signal,progress);}
 signal.throwIfAborted();exportsCache.set(win,{key,blob});
 win.dispatchEvent(new CustomEvent('videoexport',{detail:{path,elapsedMs:performance.now()-started,bytes:blob.size}}));
 return blob;
}
async function recordVideoWindow(win:HTMLElement,video:HTMLVideoElement,signal:AbortSignal,progress:Progress){
 if(win.classList.contains('minimized'))throw Error('Restore the window before saving.');
 if(!video.dataset.musicSource)throw Error('This sequence has no soundtrack.');
 const mimeType=['video/mp4;codecs=avc1.42001E,mp4a.40.2','video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus'].find(type=>MediaRecorder.isTypeSupported(type));
 if(!mimeType)throw Error('Video export is not supported in this browser.');
 const frame=composition(win,video),playbackRate=video.playbackRate,player=document.createElement('video');
 player.crossOrigin='anonymous';player.muted=true;player.playsInline=true;player.preload='auto';player.defaultPlaybackRate=playbackRate;
 const {context}=speechBus();await context.resume();
 const destination=context.createMediaStreamDestination(),gain=context.createGain();gain.gain.value=.6;gain.connect(destination);
 let audio:AudioBufferSourceNode|undefined,recording:MediaRecorder|undefined,stream:MediaStream|undefined,animation=0;
 const abort=()=>{player.pause();if(recording?.state==='recording')recording.stop();};signal.addEventListener('abort',abort);
 try{
  const loaded=new Promise<void>((resolve,reject)=>{
   player.onloadeddata=()=>resolve();player.onerror=()=>reject(Error('Could not load video for export.'));
  });
  player.src=video.currentSrc||video.src;
  const buffer=await Promise.race([Promise.all([loaded,preloadAudio(video.dataset.musicSource)]).then(([,buffer])=>buffer),new Promise<never>((_,reject)=>{
   signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  })]);signal.throwIfAborted();
  player.playbackRate=playbackRate;
  if(!Number.isFinite(player.duration)||player.duration<=0)throw Error('Video duration is unavailable.');
  audio=context.createBufferSource();audio.buffer=loopBuffer(buffer,!video.dataset.musicSource.includes('/original/'));audio.loop=true;audio.connect(gain);
  frame.draw(player,player.videoWidth,player.videoHeight);stream=frame.canvas.captureStream(30);destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));
  recording=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:6_000_000,audioBitsPerSecond:192_000});
  const chunks:Blob[]=[];
  const finished=new Promise<Blob>((resolve,reject)=>{recording!.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recording!.onerror=()=>reject(Error('Video encoding failed.'));recording!.onstop=()=>resolve(new Blob(chunks,{type:recording!.mimeType}));});
  const draw=()=>{frame.draw(player,player.videoWidth,player.videoHeight);progress(`${Math.min(99,Math.floor(player.currentTime/player.duration*100))}%`);animation=requestAnimationFrame(draw);};
  player.onended=()=>{if(recording?.state==='recording')recording.stop();};
  await player.play();signal.throwIfAborted();recording.start(250);audio.start();draw();
  const blob=await finished;signal.throwIfAborted();return blob;
 }finally{
  signal.removeEventListener('abort',abort);cancelAnimationFrame(animation);if(recording?.state==='recording')recording.stop();
  if(audio){try{audio.stop();}catch{/* Loading may fail before the source starts. */}audio.disconnect();}gain.disconnect();stream?.getTracks().forEach(t=>t.stop());destination.stream.getTracks().forEach(t=>t.stop());player.pause();player.removeAttribute('src');player.load();
 }
}

export function installVideoSave(win:HTMLElement,video:HTMLVideoElement,notify:(message:string)=>void){
 const button=win.querySelector<HTMLButtonElement>('.close')!;button.textContent='Save';button.setAttribute('aria-label','Save video with audio');button.tabIndex=0;
 let controller:AbortController|undefined,ready:File|undefined;
 win.addEventListener('windowclose',()=>controller?.abort());
 button.addEventListener('click',async event=>{
  event.stopImmediatePropagation();if(controller)return;
  // The export outlives Safari's tap allowance; a second tap opens the share sheet.
  if(ready){const file=ready;ready=undefined;button.textContent='Save';try{if(await shareFile(file))notify('Saved video with its audio loop.');}catch(error){notify(error instanceof Error?error.message:'Video could not be saved.');}return;}
  controller=new AbortController();const timeout=window.setTimeout(()=>controller?.abort(Error('Export timed out. Please retry.')),180_000);
  button.disabled=true;button.textContent='Saving';
  try{
   const blob=await exportVideoWindow(win,video,controller.signal,message=>{button.textContent=message;button.title=`Saving video: ${message}`;});
   const name=`${(win.getAttribute('aria-label')||'cinco').replace(/[^a-z0-9-]+/gi,'-')}.${blob.type.includes('mp4')?'mp4':'webm'}`,file=new File([blob],name,{type:blob.type});
   if(!shareableFile(file)){downloadBlob(blob,name);notify('Saved video with its audio loop.');}
   else if(await shareFile(file))notify('Saved video with its audio loop.');
   else{ready=file;notify('Video ready. Tap Save to add it to Photos.');}
  }catch(error){if(win.isConnected)notify(error instanceof Error?error.message:'Video could not be saved.');}
  finally{clearTimeout(timeout);controller=undefined;button.disabled=false;button.textContent=ready?'Tap to save':'Save';button.title='';}
 },{capture:true});
}
