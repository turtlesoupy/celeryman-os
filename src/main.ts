import {requestJson} from './api-client';
import {safeStorage} from './storage';
import {prewarmSession} from './session';
import {followGeneration,requestCommand,takeCommandGeneration,type GenerationFeed} from './generation-stream';
import {preparePrintout,type Printout} from './printout';
import {mobileFrame,clampFrame,type Frame,type Workspace} from './window-layout';
import {MicrophoneDevices,microphoneBlocked} from './microphone-device';
import {incompleteTranscript} from './transcript-quality';
import {launchIdentity} from './identity-launcher';
import './style.css';
import {createCommandStatus} from './command-status';
import {microphoneBlockedStatus} from './service-errors';
import {createGenerationOverlay} from './generation-overlay';
import {createScriptGuide} from './script-guide';
import {StreamingSpeech} from './streaming-speech';
import {TranscriptionTurn,prepareTranscription,warmTranscription,closeTranscription} from './streaming-transcription';
import hatTrack from './hat-track.json';
import {routeAudio,unlockAudio,onAudioBlocked,preparePlayAndRecord,Clip,preloadAudio,speechBus,duckForMicrophone,startOutputCapture,stopOutputCapture,MusicLoop,playDesktopDoubleClick} from './audio';
import {sketch,scripted,type Command,type Context} from './protocol';
import {advanceDirector,directorOwnsTurn,requestsPerformance,resolveLocally,type Beat,type ModeEffect,type Offer} from './director';
import {costumes,motions} from './dances';
import {revealVideoWindow} from './video-presentation';
import {installVideoSave} from './video-export';
import {installDesktopLinks} from './desktop-links';
import {shareableFile,shareFile} from './save-media';
// Fast generation is the default; use /?fastPath=0 for the anchored control.
const fastPath=new URLSearchParams(location.search).get('fastPath')!=='0';
// Compare streaming explicitly while full-recording transcription is the control.
const streamingTranscription=new URLSearchParams(location.search).get('streamingTranscription')==='1';
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<main class="viewport"><section class="desktop" aria-label="Cinco desktop"></section></main>';
const desktop=document.querySelector<HTMLElement>('.desktop')!;installDesktopLinks(desktop);
const dock=document.createElement('div');dock.className='dock settings-actions';
dock.innerHTML='<button type="button" class="classic-button replay-mic" disabled>Replay mic</button><button type="button" class="classic-button" data-tool="identity">Identity</button><button type="button" class="classic-button" data-tool="replay">Sketch</button><button type="button" class="classic-button" data-tool="printout">Printout</button><button type="button" class="classic-button" data-tool="sound">Sound on</button><button type="button" class="classic-button" data-tool="reset">Reset</button>';
const inputControls=document.createElement('div');inputControls.className='input-controls';
inputControls.innerHTML='<button type="button" class="classic-button record-button" aria-label="Record" aria-pressed="false" aria-describedby="record-hint"><i class="record-light" aria-hidden="true"></i><span>Record</span></button><span id="record-hint" class="record-hint"></span><span class="input-microphone">Default microphone</span><button type="button" class="classic-button mic-settings" aria-label="Microphone settings" title="Microphone settings"><svg viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges"><path fill="currentColor" d="M6 0h4v3l2-2 3 3-2 2h3v4h-3l2 2-3 3-2-2v3H6v-3l-2 2-3-3 2-2H0V6h3L1 4l3-3 2 2z"/><path fill="#ededed" d="M6 5h4v1h1v4h-1v1H6v-1H5V6h1z"/></svg></button>';
const recordButton=inputControls.querySelector<HTMLButtonElement>('.record-button')!,settingsButton=inputControls.querySelector<HTMLButtonElement>('.mic-settings')!;
const activity=document.createElement('div');activity.className='input-activity';
const diagnostics=document.createElement('div');diagnostics.className='input-diagnostics';
const generationOverlay=createGenerationOverlay();
let micBlocked=false;
const commandStatus=createCommandStatus(activity,()=>micBlocked?microphoneBlockedStatus:'',diagnostics);let feedbackToken=0;
const scriptGuide=createScriptGuide(diagnostics,activity.querySelector<HTMLElement>('.command-status-line')!);
let profile=safeStorage.getItem('cinco-profile')||'paul',identity=safeStorage.getItem('cinco-name')||'Paul';
let context:Context={identity,character:'celery',pending:'',history:[]};
let mode:'live'|'reference'='live';
const liveAssets:Record<string,{url:string;image?:string;playbackRate?:number}>={};
let generationEpoch=0;
let topZ=10,winCount=0,typing=0,started=false,sound=true,run=0,replaying=false;
// Live play holds the phone until the user reacts to the censored Tayne, like Paul does.
let awaitingCall=false;
let timers:number[]=[],music:MusicLoop|null=null,speech:Clip|null=null;
let streamedSpeech:StreamingSpeech|undefined;
let speechEpoch=0,musicEpoch=0,commandEpoch=0;
let pendingMusic:{source:string;token:number}|undefined;
let finishSpeechStatus:(()=>void)|undefined;
let mediaStatusId=0;const mediaStatusCleanup=new WeakMap<HTMLVideoElement,()=>void>();
const ducks=new Set<string>();
function musicLevel(){if(music)music.volume=sound?(ducks.size?.16:.6):0;}
function stopSpeech(){finishSpeechStatus?.();finishSpeechStatus=undefined;speechEpoch++;streamedSpeech?.stop();streamedSpeech=undefined;speech?.stop();speech=null;ducks.delete('speech');musicLevel();}
let lastPrint:Printout|undefined;let openPrintDialog:(()=>void)|undefined;
let recorder:MediaRecorder|null=null,stream:MediaStream|null=null;
let microphoneTurn:TranscriptionTurn|undefined;
addEventListener('pagehide',()=>{microphoneTurn?.cancel();closeTranscription();});
let recordingRequested=false,recordingStarting=false,pushToTalk=false,recordingNumber=0;
let recordingPointer:number|undefined,recordingCancelled=false;
let stopRecordingTimer:number|undefined,lastMicUrl='',lastMicPlayback:HTMLAudioElement|undefined;
let microphoneOpening:{token:number;promise:Promise<MediaStream>}|undefined;
// A denied permission persists until the user changes site settings; say so up front.
function setMicBlocked(blocked:boolean){micBlocked=blocked;activity.classList.toggle('mic-blocked',blocked);}
void navigator.permissions?.query({name:'microphone' as PermissionName}).then(permission=>{permission.onchange=()=>{if(permission.state==='denied')setMicBlocked(true);else if(micBlocked){setMicBlocked(false);if(started)void readyMicrophone().catch(()=>{});}};}).catch(()=>{});
const microphone=new MicrophoneDevices(()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;if(started)void readyMicrophone().catch(()=>{});},()=>recordingStarting||recorder?.state==='recording');
// Diagnostic history for window.cinco; bounded because partial transcripts arrive constantly.
const events:any[]=[],MAX_EVENTS=2000;
events.push=(...items:any[])=>{const length=Array.prototype.push.apply(events,items);if(length>MAX_EVENTS)events.splice(0,length-MAX_EVENTS);return events.length;};
const spokenLines:Record<string,string>={'okay':'Okay.','print':'Okay.','confirm':'Okay.','yes':'Yes.','hat':'Yes.','flower':'Yes.','yes-paul':'Yes, Paul!','greeting':'Good morning Paul. What will your first sequence of the day be?','beta':"I have a beta sequence I've been working on. Would you like to see it?",'repeat':'Not computing. Please repeat.','nsfw':'This is not suitable for work. Are you sure?','call':"Excuse me Paul. Your wife is on the phone. It's an emergency."};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const schedule=(fn:()=>void,ms:number)=>{const id=window.setTimeout(fn,ms);timers.push(id);return id;};
const api=requestJson;
const originalFrames=new WeakMap<HTMLElement,Frame>();
let compact=false;
function workspace():Workspace{return {width:desktop.clientWidth,height:desktop.clientHeight,top:8,bottom:desktop.clientHeight-(compact&&started?156:8)};}
function placeWindow(win:HTMLElement,frame:Frame){originalFrames.set(win,frame);const space=workspace();if(/terminal|launch|input-settings|identity-upload/.test(frame.className||''))space.bottom=desktop.clientHeight-8;const r=compact?mobileFrame(frame,space):frame;Object.assign(win.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px',transform:''});}
function fit(){
 compact=innerWidth<760||(innerHeight<500&&innerWidth<1000)||(matchMedia('(pointer: coarse)').matches&&innerWidth<1200);
 desktop.classList.toggle('mobile',compact);desktop.classList.toggle('running',started);
 const height=compact?(visualViewport?.height||innerHeight):540;
 desktop.style.width=(compact?innerWidth:960)+'px';desktop.style.height=height+'px';
 desktop.style.transform=compact?'none':`scale(${Math.min(innerWidth/960,innerHeight/540)})`;
 for(const win of desktop.querySelectorAll<HTMLElement>('.window')){const frame=originalFrames.get(win);if(frame)placeWindow(win,frame);}
}
addEventListener('resize',fit);visualViewport?.addEventListener('resize',fit);fit();
function notify(message:string){document.querySelector('.toast')?.remove();const e=document.createElement('div');e.className='toast';e.textContent=message;desktop.append(e);setTimeout(()=>e.remove(),7000);}
onAudioBlocked(()=>{if(started)notify('Tap anywhere to hear the computer.');});
type W={title:string;x:number;y:number;w:number;h:number;className?:string;menu?:string;blue?:boolean;id?:string};
function windowBox(o:W){
 const win=document.createElement('section');win.className=`window active ${o.className||''}`;win.dataset.id=o.id||`window-${++winCount}`;win.setAttribute('aria-label',o.title);win.style.zIndex=String(++topZ);placeWindow(win,o);
 const bar=document.createElement('header');bar.className=`titlebar ${o.blue?'blue':''}`;
 bar.innerHTML='<div class="sys" aria-hidden="true"><i class="window-dash"></i></div><span></span><button class="close" aria-label="Close window">Close</button><button class="min" aria-label="Minimize window"></button><button class="max" aria-label="Maximize window"></button>';
 bar.querySelectorAll('button').forEach(button=>button.tabIndex=-1);
 bar.querySelector('span')!.textContent=o.title;win.append(bar);
 if(o.menu!==undefined){const m=document.createElement('div');m.className='menu-line';m.textContent=o.menu;win.append(m);}
 const content=document.createElement('div');content.className='content';win.append(content);const bottom=document.createElement('div');bottom.className='bottom-edge';win.append(bottom);
 const handle=document.createElement('div');handle.className='resize';handle.setAttribute('aria-label','Resize window');win.append(handle);
 // Window chrome stays clickable without taking focus from the active input.
 win.addEventListener('pointerdown',event=>{win.style.zIndex=String(++topZ);syncSequenceMusic();if((event.target as Element).closest('.titlebar button'))event.preventDefault();});
 bar.querySelector('.close')!.addEventListener('click',()=>{removeWindow(win);syncSequenceMusic();});bar.querySelector('.min')!.addEventListener('click',()=>{win.classList.toggle('minimized');syncSequenceMusic();});
 let saved:Frame|undefined;bar.querySelector('.max')!.addEventListener('click',()=>{win.classList.remove('minimized');const target=saved||{x:8,y:workspace().top,w:desktop.clientWidth-16,h:workspace().bottom-workspace().top};const r=compact?clampFrame(target,workspace()):target;saved=saved?undefined:{x:win.offsetLeft,y:win.offsetTop,w:win.offsetWidth,h:win.offsetHeight};Object.assign(win.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});syncSequenceMusic();});
 function drag(e:PointerEvent,resize=false){if((e.target as HTMLElement).closest('button'))return;e.preventDefault();const scale=desktop.getBoundingClientRect().width/desktop.clientWidth,sx=e.clientX,sy=e.clientY,x=win.offsetLeft,y=win.offsetTop,w=win.offsetWidth,h=win.offsetHeight;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);const el=e.currentTarget as HTMLElement;
  const move=(ev:PointerEvent)=>{const dx=(ev.clientX-sx)/scale,dy=(ev.clientY-sy)/scale;if(compact){const r=clampFrame({x:resize?x:x+dx,y:resize?y:y+dy,w:resize?Math.max(240,w+dx):w,h:resize?Math.max(88,h+dy):h},workspace());Object.assign(win.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});}else if(resize){win.style.width=Math.max(120,w+dx)+'px';win.style.height=Math.max(60,h+dy)+'px';}else{win.style.left=Math.max(-w+40,Math.min(920,x+dx))+'px';win.style.top=Math.max(0,Math.min(515,y+dy))+'px';}};
  const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);el.removeEventListener('pointercancel',end);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
 }bar.addEventListener('pointerdown',e=>drag(e));handle.addEventListener('pointerdown',e=>drag(e,true));desktop.append(win);return {win,content};
}
function removeWindow(win:Element){
 // Detached media can retain decoders and pending playback jobs until explicitly unloaded.
 win.dispatchEvent(new Event('windowclose'));win.remove();win.querySelectorAll('video').forEach(v=>{
  mediaStatusCleanup.get(v)?.();mediaStatusCleanup.delete(v);v.pause();v.removeAttribute('src');v.load();
 });
}
function clearWindows(keepInput=started){desktop.classList.remove('finale');ducks.delete('intro');musicLevel();desktop.querySelectorAll<HTMLElement>('.window,.free-dancer,.warning-flash').forEach(win=>{
 if(!keepInput||!win.classList.contains('terminal')){removeWindow(win);return;}
 typing++;win.classList.remove('large','custom-terminal');win.querySelector('.content')!.replaceChildren();
 placeWindow(win,{x:60,y:405,w:362,h:101,className:'terminal'});
});}
function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function fitTerminalResponse(win:HTMLElement){
 if(!win.isConnected||win.classList.contains('minimized'))return;
 const content=win.querySelector<HTMLElement>('.content')!;
 const overflow=content.scrollHeight-content.clientHeight;
 if(overflow>0){
  const height=Math.min(win.offsetHeight+overflow,desktop.clientHeight-16);
  const bottom=Math.min(win.offsetTop+win.offsetHeight,desktop.clientHeight-8);
  win.style.height=height+'px';win.style.top=Math.max(8,bottom-height)+'px';
 }
 content.scrollTop=0;
}
function terminal(large=false){let win=desktop.querySelector<HTMLElement>('[data-id="terminal"]');if(win){if(large){win.classList.add('large');placeWindow(win,{x:204,y:147,w:532,h:283,className:'terminal large'});}return win;}
 const t=windowBox({title:`${identity}'s COMPUTER`,x:60,y:405,w:362,h:101,id:'terminal',className:`terminal ${large?'large':''}`});
 if(large)placeWindow(t.win,{x:204,y:147,w:532,h:283,className:'terminal large'});
 const display=document.createElement('div');display.className='terminal-display';t.content.replaceWith(display);display.append(t.content,generationOverlay.element);
 t.win.querySelector('.bottom-edge')!.remove();t.win.append(inputControls,activity);
 t.content.setAttribute('role','log');t.content.setAttribute('aria-label','Computer response');
 const mutations=new MutationObserver(()=>fitTerminalResponse(t.win));
 mutations.observe(t.content,{childList:true,characterData:true,subtree:true});
 const resize=new ResizeObserver(()=>fitTerminalResponse(t.win));resize.observe(t.content);
 t.win.addEventListener('windowclose',()=>{mutations.disconnect();resize.disconnect();},{once:true});
 return t.win;
}
async function type(text:string,large=false){const n=++typing,status=feedbackToken,key=`typing:${n}`,t=terminal(large),c=t.querySelector('.content')!;commandStatus.job(status,key,'Typing response');try{c.textContent='';const span=document.createElement('span'),cursor=document.createElement('i');cursor.className='cursor';c.append(span,cursor);for(const ch of text){if(n!==typing)return;span.textContent+=ch;await delay(22);}events.push({kind:'terminal',text,time:performance.now()});}finally{commandStatus.jobDone(status,key);}}
function videoSource(character:string,variant=''){if(mode==='reference')return `/media/original/${variant||character}.mp4`;const key=variant.endsWith('-face')?'face':variant==='tayne-intro'?'intro':variant==='tayne-squat'?'base':variant==='tayne-sway'?'sway':variant||'base';return liveAssets[`${profile}:${character}:${key}`]?.url||liveAssets[`${profile}:${character}:base`]?.url||'';}
function dancer(character:string,o:Partial<W>={},variant='',url?:string,deferPlayback=false){
 const face=variant.includes('face')||variant==='hat';const title=character==='celery'?'CINCO ID':character==='oyster'?'OYSTER':'Tayne';
 const t=windowBox({title,x:520,y:12,w:282,h:502,menu:'',...o});
 const v=document.createElement('video');const source=url||videoSource(character,variant);if(!source){t.content.textContent='Sequence not loaded.';return t;}v.src=source;v.poster=mode==='live'?(liveAssets[`${profile}:${character}:${variant==='hat'?'hat':variant.includes('face')?'face':variant==='tayne-intro'?'intro':'base'}`]?.image||''):'';v.playbackRate=liveAssets[`${profile}:${character}:${variant||'base'}`]?.playbackRate||1;v.muted=true;v.loop=true;v.autoplay=!deferPlayback;v.playsInline=true;v.dataset.character=character;v.dataset.sequence=character==='celery'?'Celery Man':character;v.className=face?'face-video':mode==='live'&&variant==='tayne-intro'?'intro-video':'';t.content.append(v);
 // Keep generated soundtrack URLs tied to this window, even if its asset cache changes.
 v.dataset.musicSource=sequenceMusicSource(character,source);installVideoSave(t.win,v,notify);queueMicrotask(syncSequenceMusic);
 const status=feedbackToken,key=`video:${++mediaStatusId}`;commandStatus.job(status,key,'Loading video');
 const progress=mode==='live'?generationOverlay.begin(generationEpoch,key,face?'Portrait':'Dancer'):undefined;
 const done=()=>{clearTimeout(timeout);progress?.done();commandStatus.jobDone(status,key);};
 const timeout=window.setTimeout(()=>{if(v.isConnected){cancelReveal();t.win.style.visibility='';t.content.textContent='Sequence unavailable. Try the command again.';commandStatus.error(status,'Video is not playing. Try the command again.');}done();},30000);
 const loadingAt=performance.now();
 const cancelReveal=revealVideoWindow(v,t.win,()=>{done();syncSequenceMusic();const elapsedMs=Math.round(performance.now()-loadingAt);events.push({kind:'video-visible',url:source,character,variant,elapsedMs,time:performance.now()});void api('client-event',{event:'video-visible',character,variant,elapsedMs,message:source}).catch(()=>{});});
 mediaStatusCleanup.set(v,()=>{done();cancelReveal();});
 v.addEventListener('error',()=>{done();cancelReveal();if(!v.isConnected)return;t.win.style.visibility='';commandStatus.error(status,'Video playback failed. Try the command again.');t.content.textContent='Sequence unavailable. Open controls to regenerate.';events.push({kind:'media-error',url:v.src});});if(!deferPlayback)void v.play().catch((error:Error)=>{if(!v.isConnected||error.name==='AbortError')return;done();cancelReveal();t.win.style.visibility='';t.content.textContent='Sequence unavailable. Try the command again.';commandStatus.error(status,`Video playback failed: ${error.message}`);});return t;
}
function portrait(character:string){
 const t=dancer(character,{title:'',x:125,y:62,w:375,h:332,menu:character==='celery'?'Celery Man':character==='oyster'?'Celery Man':'Tayne',blue:true,className:'portrait'},character+'-face');
 // Phones cannot set them side by side, so the dancer stays in front of the portrait.
 if(compact)[...desktop.querySelectorAll<HTMLElement>('.window:not(.portrait):not(.terminal):has(video)')].sort((a,b)=>Number(a.style.zIndex)-Number(b.style.zIndex)).forEach(win=>{win.style.zIndex=String(++topZ);});
 return t;
}
function sequenceMusicSource(character:string,source=videoSource(character)){
 return ['celery','oyster','tayne','chaos'].includes(character)?`/media/original/music-${character}.wav`:source;
}
function syncSequenceMusic(){
 // The scripted finale has one shared score across its cascade of windows.
 if(desktop.classList.contains('finale'))return;
 const front=[...desktop.querySelectorAll<HTMLElement>('.window:not(.minimized):not(.hidden)')]
  .filter(win=>win.style.display!=='none'&&win.style.visibility!=='hidden'&&win.querySelector('video[data-music-source]'))
  .sort((a,b)=>Number(b.style.zIndex)-Number(a.style.zIndex))[0];
 const video=front?.querySelector<HTMLVideoElement>('video[data-music-source]');
 const intros=[...desktop.querySelectorAll<HTMLVideoElement>('video.intro-video')];
 // Intro pictures stay muted; their soundtrack plays as a Clip (see showTayne).
 intros.forEach(intro=>intro.muted=true);
 if(intros.some(intro=>intro.dataset.voice==='playing'&&!intro.paused))ducks.add('intro');else ducks.delete('intro');
 musicLevel();
 if(video){musicFor(video.dataset.character!,video.dataset.musicSource);return;}
 if(desktop.querySelector('.free-dancer'))return;
 ++musicEpoch;pendingMusic=undefined;music?.stop();music=null;
}
function musicFor(character:string,source=sequenceMusicSource(character)){
 if(pendingMusic?.source===source&&pendingMusic.token===musicEpoch)return;
 const token=++musicEpoch;pendingMusic=undefined;
 if(music?.url===source){void music.play();return;}
 // Do not keep the previous foreground sequence audible while the new one loads.
 music?.pause();
 if(!source)return;
 pendingMusic={source,token};
 const status=feedbackToken,key=`music:${token}`;commandStatus.job(status,key,'Loading music');const next=new MusicLoop(source,!source.includes('/original/'));next.volume=0;
 void next.ready.then(()=>{if(token!==musicEpoch){next.stop();commandStatus.jobDone(status,key);return;}pendingMusic=undefined;music?.stop();music=next;musicLevel();void music.play();commandStatus.jobDone(status,key);events.push({kind:'music-playing',url:source,time:performance.now()});}).catch(e=>{next.stop();commandStatus.jobDone(status,key);if(token!==musicEpoch)return;pendingMusic=undefined;commandStatus.error(status,'Music could not load. Try the command again.');events.push({kind:'music-error',message:String(e)});});
}
async function speechOutputReady(){
 await microphoneOpening?.promise.catch(()=>{});
 await unlockAudio();
}
async function speak(cmd:Command){
 if(!sound||!cmd.response)return;
 stopSpeech();const epoch=speechEpoch,status=feedbackToken,key=`voice:${epoch}`;
 commandStatus.job(status,key,cmd.audio?'Loading voice':'Generating voice');
 const done=()=>commandStatus.jobDone(status,key);finishSpeechStatus=done;
 if(!cmd.audio){
  const requestedAt=performance.now(),src='/api/voice/stream';
  events.push({kind:'audio',src,text:cmd.response,spokenText:cmd.response,time:requestedAt});
  const release=()=>{done();if(epoch===speechEpoch){ducks.delete('speech');musicLevel();}};
  const current=new StreamingSpeech(cmd.response,{
   beforePlayback:speechOutputReady,
   onStart:()=>{if(epoch!==speechEpoch||!sound)return;commandStatus.job(status,key,'Speaking');ducks.add('speech');musicLevel();events.push({kind:'audio-playing',src,text:cmd.response,spokenText:cmd.response,latencyMs:performance.now()-requestedAt,time:performance.now()});},
   onEnd:()=>{release();events.push({kind:'voice-ended',text:cmd.response,time:performance.now()});},
   onError:error=>{release();if(epoch===speechEpoch){commandStatus.error(status,`Voice unavailable: ${error.message}`);notify(`Voice unavailable: ${error.message}`);events.push({kind:'voice-error',message:error.message});}},
   onComplete:summary=>events.push({kind:'voice-stream-complete',text:cmd.response,...summary,time:performance.now()})
  });streamedSpeech=current;await current.started;return;
 }
 try{const src=`/media/original/${cmd.audio}.wav${cmd.audio==='engaged'?'?v=2':''}`;
  await speechOutputReady();
  if(epoch!==speechEpoch||!sound)return;const current=new Clip(src);speech=current;
  const release=()=>{done();if(epoch===speechEpoch){ducks.delete('speech');musicLevel();}};
  events.push({kind:'audio',src,text:cmd.response,spokenText:cmd.audio?(spokenLines[cmd.audio]||cmd.response):cmd.response,time:performance.now()});
  void current.done.then(release);
  await current.play(()=>{if(epoch!==speechEpoch)return;commandStatus.job(status,key,'Speaking');ducks.add('speech');musicLevel();events.push({kind:'audio-playing',src,text:cmd.response,spokenText:cmd.audio?(spokenLines[cmd.audio]||cmd.response):cmd.response,time:performance.now()});});
 }catch(e){done();if(epoch===speechEpoch){ducks.delete('speech');musicLevel();commandStatus.error(status,`Voice unavailable: ${(e as Error).message}`);notify(`Voice unavailable: ${(e as Error).message}`);}events.push({kind:'voice-error',message:String(e)});}
}
function loading(label:string,boot=false){const t=windowBox({title:'Cinco Identity Generator 2.5',x:boot?221:221,y:boot?70:209,w:526,h:boot?362:157,className:boot?'boot intro':'boot',id:'loader'});
 if(boot){const art=document.createElement('div');art.className='identity-art';art.innerHTML=`<svg viewBox="0 0 140 180" aria-label="Wireframe identity"><defs><pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#49b6c9" stroke-width=".65"/></pattern><clipPath id="head"><path d="M35 174L40 142 31 120 22 92 24 50Q28 10 70 6Q112 10 116 50L118 92 109 120 100 142 105 174Z"/></clipPath></defs><path d="M35 174L40 142 31 120 22 92 24 50Q28 10 70 6Q112 10 116 50L118 92 109 120 100 142 105 174Z" fill="#146884"/><rect width="140" height="180" fill="url(#grid)" clip-path="url(#head)"/><path d="M70 7Q34 82 70 172M70 7Q105 82 70 172M24 70Q70 94 116 70M28 110Q70 130 112 110" stroke="#60c5cd" fill="none" stroke-width=".6"/></svg>`;t.content.append(art);const brand=document.createElement('div');brand.className='brand';brand.textContent='Cinco Identity Generator 2.5';t.content.append(brand);}
 const p=document.createElement('div');p.className='progress';p.innerHTML='<i></i>';t.content.append(p);const l=document.createElement('div');l.className='loading-label';l.textContent=label;t.content.append(l);return t;
}
function showCelery(){clearWindows();terminal();dancer('celery');portrait('celery');musicFor('celery');}
function showTayne(followupReady?:Promise<boolean>){
 clearWindows();const intro=dancer('tayne',{x:482,y:14},'tayne-intro',undefined,true),v=intro.content.querySelector('video');musicFor('tayne');if(!v)return;
 const status=feedbackToken,key='tayne-introduction';commandStatus.job(status,key,'Playing Tayne introduction');
 // iOS refuses an unmuted video started long after the tap, so the picture plays
 // muted and its soundtrack plays as a clip on the already-unlocked audio output.
 const voice=mode==='live'&&sound?new Clip(v.currentSrc||v.src):undefined;if(voice)void preloadAudio(voice.url).catch(()=>{});
 const release=()=>{voice?.stop();delete v.dataset.voice;ducks.delete('intro');musicLevel();};let transitioned=false;
 if(voice)void voice.done.then(()=>{delete v.dataset.voice;syncSequenceMusic();});
 const advance=async()=>{if(transitioned||!intro.win.isConnected)return;transitioned=true;release();
  if(followupReady){commandStatus.job(status,key,'Preparing Tayne choreography');const ready=await followupReady;if(!intro.win.isConnected)return;if(!ready){commandStatus.jobDone(status,key);return;}}
  commandStatus.jobDone(status,key);
  clearWindows();dancer('tayne',{x:70,y:30,w:245,h:455},'tayne-sway');const right=dancer('tayne',{x:680,y:30,w:245,h:455},'tayne-sway');right.content.querySelector('video')!.style.transform='scaleX(-1)';const t=windowBox({title:'OYSTER',x:320,y:100,w:360,h:320,menu:''});t.content.innerHTML=`<div class="name-card"><svg viewBox="0 0 56 30" aria-label="TAYNE"><path d="M0 1H10V5H7V29H4V5H0Z M11 29V10H13V5H15V1H18V5H20V10H22V29H19V19H14V29Z M14 10V16H19V10H17V6H16V10Z M23 1H26V10H28V14H30V10H32V1H35V13H32V17H31V29H28V17H26V13H23Z M36 29V1H39V7H41V13H43V1H46V29H43V21H41V15H39V29Z M47 1H56V5H50V13H55V17H50V25H56V29H47Z" fill="black" fill-rule="evenodd"/></svg></div>`;
  schedule(()=>{clearWindows();for(let i=0;i<7;i++)dancer('tayne',{x:233+i*36,y:28+[0,25,55,73,52,22,-2][i],w:282,h:502},'tayne-squat');},3700);
 };
 v.loop=false;
 if(mode==='live'){v.muted=true;v.addEventListener('playing',()=>{if(voice)void voice.play(()=>{v.dataset.voice='playing';syncSequenceMusic();}).catch(()=>{});},{once:true});v.addEventListener('playing',syncSequenceMusic);v.addEventListener('ended',advance,{once:true});}
 else {v.muted=true;v.addEventListener('playing',()=>{void speak({action:'tayne',response:"Hey Paul. I'm Tayne, your latest dancer. I can't wait to entertain you.",audio:'intro'});schedule(advance,4800);},{once:true});}
 v.addEventListener('pause',release);v.addEventListener('error',()=>{release();commandStatus.jobDone(status,key);});
 const previousCleanup=mediaStatusCleanup.get(v);mediaStatusCleanup.set(v,()=>{previousCleanup?.();commandStatus.jobDone(status,key);release();});
 // Playback starts long after the user's gesture. If autoplay policy blocks
 // sound, continue silently; if it still cannot play, skip ahead rather than
 // waiting forever for an ended event.
 const playFailed=(error:Error)=>{
  if(!intro.win.isConnected||error.name==='AbortError')return;
  if(error.name==='NotAllowedError'&&!v.muted){v.muted=true;void v.play().catch(playFailed);return;}
  commandStatus.error(status,`Tayne introduction could not play: ${error.message}`);void advance();
 };
 void v.play().catch(playFailed);
}

function showHat(){
 clearWindows();const term=terminal();if(!compact)Object.assign(term.style,{left:'72px',top:'390px'});
 // Recorded front-window rectangles from the sketch; scale chrome with the window.
 const hatStart=performance.now();const create=(box:number[])=>{const scale=box[2]/901;const t=dancer('tayne',{title:'',menu:'Tayne',blue:true,x:box[0]/2-23.5*scale,y:box[1]/2-56*scale,w:476,h:410,className:'portrait hat-cascade'},'hat');t.win.style.transformOrigin='top left';if(!compact)t.win.style.transform=`scale(${scale})`;const v=t.content.querySelector('video')!;v.addEventListener('loadeddata',()=>{v.currentTime=(performance.now()-hatStart)/1000%v.duration;},{once:true});return t.win;};
 create(hatTrack[0]);let front=create(hatTrack[0]);
 hatTrack.forEach((box,i)=>{if(!i)return;schedule(()=>{if(i<=20&&i%5===0)front=create(box);const scale=box[2]/901;if(compact)placeWindow(front,{x:box[0]/2-23.5*scale,y:box[1]/2-56*scale,w:476,h:410,className:'portrait hat-cascade'});else Object.assign(front.style,{left:box[0]/2-23.5*scale+'px',top:box[1]/2-56*scale+'px',transform:`scale(${scale})`});if(i>20&&i%5===0)front=create(box);},i*1000/29.97);});
}
function desktopDancer(){
 const video=document.createElement('video');video.src=videoSource('tayne','flarhgunnstow');video.muted=true;video.loop=true;video.playsInline=true;void video.play();
 const canvas=document.createElement('canvas');canvas.width=266;canvas.height=434;canvas.className='free-dancer';desktop.append(canvas);const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
 // Remove only the studio backdrop from a complete generated person, as in the sketch.
 const draw=()=>{if(!canvas.isConnected){video.pause();return;}if(video.readyState>=2){ctx.drawImage(video,0,0,266,434);const f=ctx.getImageData(0,0,266,434),d=f.data;for(let i=0;i<d.length;i+=4){const min=Math.min(d[i],d[i+1],d[i+2]),max=Math.max(d[i],d[i+1],d[i+2]);if(min>165&&max-min<35)d[i+3]=Math.max(0,255-(min-165)*8);}ctx.putImageData(f,0,0);}requestAnimationFrame(draw);};requestAnimationFrame(draw);return canvas;
}
function showFlower(){
 desktop.querySelectorAll('.window:not(.hat-cascade):not(.terminal)').forEach(removeWindow);
 const hats=[...desktop.querySelectorAll<HTMLElement>('.hat-cascade')];hats.reverse().forEach((w,i)=>schedule(()=>removeWindow(w),i*160));
 schedule(()=>{const actor=desktopDancer();schedule(()=>{actor.remove();clearWindows();for(let i=0;i<3;i++)dancer('tayne',{x:60+i*293,y:17,w:282,h:500},'flarhgunnstow');},1700);},450);
}
function showPrintout(){
 if(!lastPrint){notify('No pages in the print queue.');return;}
 const old=desktop.querySelector('[data-id="print"]');if(old)removeWindow(old);
 const job=lastPrint,t=windowBox({title:`Print Manager — ${job.character.toUpperCase()}`,x:340,y:84,w:300,h:380,className:'print-preview',id:'print'});
 const img=document.createElement('img');img.src=job.image;img.alt=`${job.name} smiling as ${job.character}`;t.content.append(img);
 const label=document.createElement('small');label.textContent='1 page · Choose a printer or Save as PDF';t.content.append(label);
 const actions=document.createElement('div');actions.className='print-actions';t.content.append(actions);
 const print=document.createElement('button');print.className='classic-button';print.textContent='Print…';print.disabled=!openPrintDialog;const ready=openPrintDialog;
 print.onclick=()=>{try{ready?.();}catch(e){notify(`Print dialog unavailable: ${(e as Error).message}`);}};actions.append(print);
 const save=document.createElement('button');save.className='classic-button';save.textContent='Save image';const name=`${job.character}-smiling.png`;
 // Fetch ahead so the tap itself can open the phone's share sheet (Save Image goes to Photos).
 let file:File|undefined;void fetch(job.image).then(r=>r.ok?r.blob():Promise.reject()).then(blob=>{file=new File([blob],name,{type:blob.type||'image/png'});},()=>{});
 save.onclick=()=>{if(file&&shareableFile(file))void shareFile(file).catch(()=>{});else{const a=document.createElement('a');a.href=job.image;a.download=name;a.click();}};actions.append(save);
}
function showNsfw(confirmed=false){
 clearWindows();
 const t=dancer('tayne',{x:confirmed?345:596,y:confirmed?16:18,w:282,h:501},'tayne-sway');
 const video=t.content.querySelector('video');if(video&&confirmed){video.dataset.sequence='Tayne / NSFW preview';censor(t.win,{cols:22,rows:40,crisp:true});}
 // The source cuts to Paul's reaction after the warning. Keep that unseen reveal
 // represented by the same retro censor window until the phone interrupts it.
 const banner=windowBox({title:'Cinco Identity Generator 2.5',x:confirmed?218:325,y:278,w:525,h:162,className:'nsfw',id:'nsfw-banner'});
 banner.content.textContent='NSFW';banner.win.setAttribute('aria-label',confirmed?'NSFW censored preview':'NSFW warning');
}
function showCall(call?:{caller:string;line:string}){
 const banner=desktop.querySelector('[data-id="nsfw-banner"]');if(banner)removeWindow(banner);
 const preview=desktop.querySelector<HTMLVideoElement>('video[data-sequence="Tayne / NSFW preview"]');if(preview){preview.dataset.sequence='tayne';uncensor(preview);}
 desktop.classList.add('alarm');const main=desktop.querySelector<HTMLElement>('.window:not(.terminal)');if(main)placeWindow(main,{x:345,y:16,w:282,h:503});
 const t=windowBox({title:'',blue:true,menu:'INCOMING CALL',x:398,y:126,w:150,h:225,className:'phone',id:'call'});
 t.content.innerHTML='<div class="number">545-33448</div><div class="phone-screen"><svg class="receiver" viewBox="0 0 64 70" aria-label="Telephone"><path d="M15 14Q8 39 47 53" fill="none" stroke="white" stroke-width="12" stroke-linecap="round"/><path d="M14 9L22 20M42 49L53 52" stroke="white" stroke-width="14" stroke-linecap="round"/><path d="M30 7L27 16M39 11L32 19M44 19L35 23" stroke="white" stroke-width="3"/></svg><div class="label">WIFE</div></div>';
 // A director call keeps the sketch's phone and changes only who is calling.
 if(call){const label=t.content.querySelector<HTMLElement>('.label')!;label.textContent=call.caller;label.classList.toggle('long',call.caller.length>5);let h=0;for(const ch of call.caller)h=(h*31+ch.charCodeAt(0))>>>0;t.content.querySelector('.number')!.textContent=`555-${String(1000+h%9000)}`;void speak({action:'director',response:call.line});}
 else void speak({action:'call',response:`Excuse me ${identity}. Your wife is on the phone. It's an emergency.`,audio:profile==='paul'?'call':undefined});
 events.push({kind:'action',action:'call',caller:call?.caller,time:performance.now()});
}
function chaos(error='ERROR: BETA TAYNE\nIMPROPER CODING'){
 desktop.classList.remove('alarm');clearWindows();desktop.classList.add('finale');musicFor('chaos');
 // Keep the rapid cascade, but retire its oldest windows instead of accumulating
 // dozens of video decoders. Native video preserves the backdrop and proportions.
 const windows:HTMLElement[]=[];
 const add=(create:()=>ReturnType<typeof windowBox>)=>{
  while(windows.length>=8)removeWindow(windows.shift()!);
  const t=create();t.win.classList.add('finale-window');windows.push(t.win);return t;
 };
 for(let i=0;i<11;i++)schedule(()=>add(()=>dancer('mozzarell',{title:'CINCO ID',x:88+i*31,y:3+i*30,w:314,h:447})),i*50);
 for(let i=0;i<5;i++)schedule(()=>add(()=>dancer('mozzarell',{title:'CINCO ID',x:428+i*31,y:3+i*30,w:282,h:503})),550+i*45);
 schedule(()=>add(()=>dancer('mozzarell',{title:'MOZZARELL',x:18,y:58,w:486,h:300,menu:undefined,className:'chaos-portrait'},'mozzarell-face')),780);
 for(let i=0;i<2;i++)schedule(()=>{const t=add(()=>windowBox({title:'Cinco Identity Generator 2.5',x:223+i*18,y:217+i*22,w:526,h:162,className:'error'}));t.content.textContent=error;},970+i*80);
 // Performers made this session join the cascade; during the sketch there are none.
 const cast=mode==='live'?(context.director?.cast||[]).filter(c=>videoSource(c)):[];
 const available=[...cast,...['tayne','celery','oyster','mozzarell'].filter(c=>mode==='reference'||videoSource(c))];
 for(let i=0;i<16;i++)schedule(()=>{
  const c=available[i%available.length]||'mozzarell';
  add(()=>dancer(c,{title:c==='celery'?'CINCO ID':c.toUpperCase(),x:20+(i*137)%640,y:68+(i*67)%210,w:280,h:245,menu:undefined,className:'chaos-portrait'},c==='tayne'?'hat':cast.includes(c)?'':c+'-face'));
 },2100+i*180);
}
function presentSequence(show:()=>void,ms:number){const status=feedbackToken,order=commandEpoch,token=run;commandStatus.job(status,'presentation','Opening sequence');schedule(()=>{if(order===commandEpoch&&token===run)show();commandStatus.jobDone(status,'presentation');},ms);}
async function apply(cmd:Command,acknowledged=false){
 const preparingAt=performance.now();events.push({kind:'action',...cmd,time:performance.now()});if(cmd.action==='reaction'){if(awaitingCall){awaitingCall=false;showCall();}return;}awaitingCall=false;clearTimers();if(desktop.classList.contains('finale')&&cmd.action!=='attention')clearWindows();if(cmd.action!=='attention')context.pending='';
 if(!acknowledged&&!['greeting','engage','director'].includes(cmd.action)&&(cmd.audio||['celery','attention','custom','dialogue'].includes(cmd.action)))void speak(cmd);
 // Start the spoken introduction as soon as it is ready; the two dance clips
 // prepare behind it instead of blocking all visible response for ~20 seconds.
 if(mode==='live'&&cmd.action==='tayne'){
  const epoch=++generationEpoch;
  const followup=Promise.all([prepareDance('tayne','base',epoch),prepareDance('tayne','sway',epoch)]).then(ready=>ready.every(Boolean));
  if(!await prepareDance('tayne','intro',epoch))return false;
  context.character='tayne';context.costume=costumes.tayne;showTayne(followup);return true;
 }
 // The portrait is supplementary: a slow or failed image must not withhold
 // the finished dancer. Keep its job visible while it finishes independently.
 if(mode==='live'&&['celery','oyster'].includes(cmd.action)){
  const character=cmd.action,epoch=++generationEpoch,token=run;
  const face=prepareDance(character,'face',epoch);
  if(!await prepareDance(character,'base',epoch))return false;
  context.character=character;context.costume=costumes[character];
  if(character==='celery'){clearWindows();terminal();}
  const main=dancer(character,character==='oyster'?{x:421,y:47,w:487,h:424}:{});
  musicFor(character);void type(cmd.response);
  void face.then(ready=>{if(ready&&token===run&&epoch===generationEpoch&&main.win.isConnected)portrait(character);});
  return true;
 }
 const generating=(['celery','oyster','tayne','hat','flarhgunnstow','print'].includes(cmd.action)||(cmd.action==='engage'&&context.character==='celery'));
 if(mode==='live'&&generating){const epoch=++generationEpoch;const character=cmd.action==='engage'?'celery':['hat','flarhgunnstow'].includes(cmd.action)?'tayne':cmd.action==='print'?(cmd.target||context.character):cmd.action;const variant=cmd.action==='engage'?'engaged':cmd.action==='hat'?'hat':cmd.action==='flarhgunnstow'?'flarhgunnstow':cmd.action==='print'?'smile':'base';
  const work=[prepareDance(character,variant,epoch,cmd.action==='print'?cmd:undefined)];
  if(variant==='base'&&['celery','oyster'].includes(character))work.push(prepareDance(character,'face',epoch));
  if(character==='tayne'&&variant==='base')work.push(prepareDance(character,'intro',epoch),prepareDance(character,'sway',epoch));
  const ready=await Promise.all(work);if(ready.some(ok=>!ok))return false;
 }
 if(mode==='live'&&cmd.action==='chaos'){const epoch=++generationEpoch;const ready=await Promise.all([prepareDance('mozzarell','base',epoch),prepareDance('mozzarell','face',epoch)]);if(ready.some(ok=>!ok))return false;}
 if(cmd.action==='reset'){reset();return;}
 if(cmd.action==='greeting'){
  clearWindows();const loader=loading('Preparing computer voice, please wait...',true);
  terminal().style.zIndex=String(++topZ);
  // Show the greeting and accept commands immediately; cloud speech can arrive later.
  void type(cmd.response);void speak(cmd);schedule(()=>loader.win.remove(),4000);
 }
 if(cmd.action==='celery'){context.character='celery';context.costume=costumes.celery;clearWindows();loading('Loading CELERY MAN, please wait...');void type(cmd.response);presentSequence(showCelery,mode==='live'?Math.max(0,1500-(performance.now()-preparingAt)):1500);}
 if(cmd.action==='engage'){
  const order=commandEpoch,token=run,status=feedbackToken;
  const videos=[...desktop.querySelectorAll('video')];
  await Promise.all(videos.map(async v=>{
   if(v.dataset.character!=='celery'||v.classList.contains('face-video')){v.playbackRate=1.4;return;}
   const key='engaged-video',progress=mode==='live'?generationOverlay.begin(generationEpoch,key,'Dancer'):undefined;
   commandStatus.job(status,key,'Loading video');
   try{
    await new Promise<void>((resolve,reject)=>{
     let frame:number|undefined;
     const cleanup=()=>{clearTimeout(timer);v.removeEventListener('loadeddata',loaded);v.removeEventListener('error',failed);if(frame!==undefined)v.cancelVideoFrameCallback(frame);};
     const ready=()=>{cleanup();resolve();};
     const loaded=()=>{if(v.readyState>=2&&(v.paused||!v.requestVideoFrameCallback))ready();};
     const failed=()=>{cleanup();reject(Error('Engaged video could not load.'));};
     const timer=setTimeout(failed,30000);
     v.addEventListener('loadeddata',loaded);v.addEventListener('error',failed);
     v.dataset.sequence='Celery Man / 4d3d3d3';v.src=videoSource('celery','engaged');
     if(v.requestVideoFrameCallback)frame=v.requestVideoFrameCallback(ready);
     void v.play().catch(failed);
    });
   }finally{progress?.done();commandStatus.jobDone(status,key);}
  }));
  if(token!==run||order!==commandEpoch)return false;
  // The sketch cuts to a new track once 4d3d3d3 kicks in; retag the portrait too so focus can't restore the old score.
  videos.forEach(v=>{if(v.dataset.character==='celery')v.dataset.musicSource='/media/original/music-engaged.wav?v=2';});syncSequenceMusic();
  void type(cmd.response);if(!acknowledged)void speak(cmd);
 }
 if(cmd.action==='oyster'){context.character='oyster';context.costume=costumes.oyster;portrait('oyster');dancer('oyster',{x:421,y:47,w:487,h:424});musicFor('oyster');void type(cmd.response);}
 if(cmd.action==='print'){
  const character=cmd.target||context.character,image=mode==='reference'?'/media/original/oyster-face.png':liveAssets[`${profile}:${character}:smile`]?.image||'';
  const job:Printout={image,character,name:identity},order=commandEpoch,status=feedbackToken;
  commandStatus.job(status,'print-image','Preparing printout');
  try{const ready=await preparePrintout(job);if(order!==commandEpoch)return;lastPrint=job;openPrintDialog=ready;events.push({kind:'print-spooled',...job,time:performance.now()});showPrintout();commandStatus.job(status,'print-image','Print dialog · print or cancel');events.push({kind:'print-dialog-requested',...job,time:performance.now()});ready();}
  finally{commandStatus.jobDone(status,'print-image');}
 }
 if(cmd.action==='attention'||cmd.action==='cancel')void type(cmd.response);
 if(cmd.action==='dialogue')void type(cmd.response);
 if(cmd.action==='beta'){clearWindows();music?.pause();context.pending='beta';void type(cmd.response,true);}
 if(cmd.action==='tayne'){context.character='tayne';context.costume=costumes.tayne;clearWindows();loading('Loading BETA, please wait...');presentSequence(showTayne,mode==='live'?Math.max(0,1150-(performance.now()-preparingAt)):1150);}
 if(cmd.action==='hat'){context.character='tayne';showHat();void type(cmd.response);}
 if(cmd.action==='flarhgunnstow'){showFlower();void type(cmd.response);}
 if(cmd.action==='repeat'){context.pending='repeat';void type(cmd.response);}
 if(cmd.action==='nsfw'){context.pending='nsfw';showNsfw();}
 if(cmd.action==='confirm'){showNsfw(true);if(replaying)schedule(showCall,6900);else{awaitingCall=true;schedule(()=>{if(awaitingCall){awaitingCall=false;showCall();}},20000);}}
 if(cmd.action==='call')showCall();
 if(cmd.action==='chaos')chaos();
 if(cmd.action==='custom')return customDance(cmd);
 if(cmd.action==='director')return directorBeat(cmd,cmd.beat!,acknowledged);

}
// Director beats: the sketch's own scenes, generalized (see src/director.ts).
async function directorBeat(cmd:Command,beat:Beat,acknowledged:boolean){
 const say=()=>{if(!acknowledged)void speak(cmd);};
 switch(beat.kind){
  case 'pitch':clearWindows();music?.pause();say();void type(cmd.response.replace(/\s+([^.!?]*\?)$/,'\n\n$1'),true);return true;
  case 'reveal':say();return revealSequence(cmd,beat.offer);
  case 'mode':engageMode(beat.effect);say();void type(cmd.response);return true;
  case 'taboo':
   say();
   if(beat.stage==='warn'){showWarning();return true;}
   if(beat.stage!=='reveal'){void type(cmd.response);return true;}
   if(!cmd.costume){deleteDesktop();return true;}
   return tabooReveal(cmd);
  case 'call':say();showCall({caller:beat.caller,line:cmd.response});return true;
  case 'answer':
   say();desktop.classList.remove('alarm');void type(cmd.response);
   schedule(()=>{const phone=desktop.querySelector('[data-id="call"]');if(phone)removeWindow(phone);void type('They hung up.');},2600);return true;
  case 'chaos':chaos(cmd.response);return true;
 }
}
async function revealSequence(cmd:Command,offer:Offer){
 clearWindows();const loader=loading(cmd.response);const epoch=++generationEpoch;
 if(mode==='live'&&!await prepareDance(offer.label,'base',epoch,cmd)){loader.win.remove();return false;}
 if(epoch!==generationEpoch)return false;
 loader.win.remove();context.character=offer.label;context.costume=offer.costume;
 dancer(offer.label,{title:offer.label,className:'custom-dancer',x:520,y:12,w:282,h:502});titleCard(offer.label);musicFor(offer.label);
 void type(offer.introLine||`${offer.label} loaded.`);return true;
}
/** A pixel-font name card, like the TAYNE card, for any label. */
function titleCard(label:string){
 const t=windowBox({title:label,x:150,y:90,w:360,h:260,menu:'',className:'title-card'});
 const card=document.createElement('div');card.className='name-card';t.content.append(card);
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;canvas.width=label.length*8+4;canvas.height=15;canvas.setAttribute('aria-label',label);canvas.className='pixel-title';
 ctx.font='bold 13px monospace';ctx.textBaseline='top';ctx.fillText(label,2,1);
 // Snap the anti-aliased text to hard pixels before it is scaled up.
 const image=ctx.getImageData(0,0,canvas.width,canvas.height);for(let i=3;i<image.data.length;i+=4)image.data[i]=image.data[i]>110?255:0;ctx.putImageData(image,0,0);
 // Not a scheduled step: the next command must not leave the card stranded.
 card.append(canvas);window.setTimeout(()=>{if(t.win.isConnected)removeWindow(t.win);},4200);
}
function engageMode(effect:ModeEffect){desktop.dataset.mode=effect;if(effect==='turbo')desktop.querySelectorAll('video').forEach(v=>v.playbackRate=2);}
function showWarning(){
 const banner=windowBox({title:'Cinco Identity Generator 2.5',x:325,y:278,w:525,h:162,className:'nsfw',id:'nsfw-banner'});banner.content.textContent='NSFW';banner.win.setAttribute('aria-label','NSFW warning');
 const flash=document.createElement('div');flash.className='warning-flash';flash.textContent='WARNING';flash.setAttribute('aria-hidden','true');desktop.append(flash);
}
async function tabooReveal(cmd:Command){
 const epoch=++generationEpoch,label=cmd.label||'TAYNE';
 if(mode==='live'&&!await prepareDance(label,'base',epoch,cmd))return false;
 if(epoch!==generationEpoch)return false;
 clearWindows();const t=dancer(label,{title:label,x:345,y:16,w:282,h:501});censor(t.win);
 const banner=windowBox({title:'Cinco Identity Generator 2.5',x:218,y:278,w:525,h:162,className:'nsfw',id:'nsfw-banner'});banner.content.textContent='NSFW';banner.win.setAttribute('aria-label','NSFW censored preview');
 return true;
}
/** The reveal is never shown plainly: a coarse, blurred mosaic of a clothed render. */
function censor(win:HTMLElement,{cols=14,rows=26,crisp=false}={}){
 const v=win.querySelector('video');if(!v)return;
 const canvas=document.createElement('canvas');canvas.width=cols;canvas.height=rows;canvas.className=crisp?'mosaic crisp':'mosaic';v.classList.add('censored');v.after(canvas);
 const ctx=canvas.getContext('2d')!;const draw=()=>{if(!canvas.isConnected)return;if(v.readyState>=2)ctx.drawImage(v,0,0,canvas.width,canvas.height);requestAnimationFrame(draw);};requestAnimationFrame(draw);
}
function uncensor(v:HTMLVideoElement){v.classList.remove('censored');if(v.nextElementSibling?.classList.contains('mosaic'))v.nextElementSibling.remove();}
/** "Delete the internet": the desktop empties, then restores itself. */
function deleteDesktop(){
 const windows=[...desktop.querySelectorAll<HTMLElement>('.window:not(.terminal)')];
 windows.forEach((w,i)=>schedule(()=>removeWindow(w),i*220));
 schedule(()=>{const t=windowBox({title:'Cinco Identity Generator 2.5',x:223,y:190,w:526,h:162,className:'error',id:'internet'});t.content.textContent='INTERNET DELETED';
  schedule(()=>{t.content.textContent='INTERNET RESTORED\nFROM BACKUP';},2600);},windows.length*220+300);
}
async function prepareDance(character:string,variant:string,epoch:number,cmd?:Command){
 terminal();const token=run;const key=`${profile}:${character}:${variant}`;
 const startedAt=performance.now(),feedback=feedbackToken,jobKey=`${epoch}:${key}`;let generationId:string|undefined,feed:GenerationFeed|undefined;
 const report=(event:string,message?:string)=>void api('client-event',{event,jobId:generationId,character,variant,elapsedMs:Math.round(performance.now()-startedAt),message}).catch(()=>{});
 const describe=(stage:string)=>`${stage} (${variant==='face'?'portrait':variant==='base'?'dancer':variant})`;
 const progress=generationOverlay.begin(epoch,jobKey,variant==='face'?'Portrait':variant==='base'?'Dancer':variant==='smile'?'Printout':variant==='intro'?'Introduction':variant==='hat'?'Hat wobble':'Dance');
 commandStatus.job(feedback,jobKey,describe('Loading'));
 try{const req={profile,character,variant,fastPath,...(cmd?.playbackRate?{playbackRate:cmd.playbackRate}:{}),canonical:!cmd&&['celery','oyster','tayne','mozzarell'].includes(character),motion:variant==='intro'?`Tight head-and-shoulders close up. Face fills most of the vertical frame, head and upper chest only. Light gray background. Look at camera and say in a warm natural American voice: Hey ${identity}. I'm Tayne, your latest dancer. I can't wait to entertain you. Keep the same clothing, face, and fixed camera.`:cmd?.motion||motions[variant]||motions[character],costume:cmd?.costume||costumes[character]||costumes.tayne};
  // The command stream already follows a dance the server started early.
  feed=(cmd?.generationId&&takeCommandGeneration(cmd.generationId))||followGeneration(cmd?.generationId&&cmd.generationRequest?cmd.generationRequest:req);
  let job=await feed.first();generationId=job.id;events.push({kind:'generation',id:job.id,request:req,time:performance.now()});
  while(job.status==='working'&&(!job.previewUrl||variant==='smile')){if(token!==run||epoch!==generationEpoch){report('generation-cancelled','Superseded by another sequence or reset');return false;}const elapsed=Math.floor((performance.now()-startedAt)/1000);if(elapsed>180)throw Error('Sequence is taking too long. Please try again.');const stage=job.providerStatus==='IN_QUEUE'?'Queued for video':job.stage||'Rendering dance';commandStatus.job(feedback,jobKey,describe(stage));progress.update(stage);job=await feed.next();}
  if(token!==run||epoch!==generationEpoch){report('generation-cancelled','Superseded by another sequence or reset');return false;}if(job.status==='error')throw Error(job.error||'Generation failed. Please retry the command.');liveAssets[key]={url:(job.status==='complete'?job.url:job.previewUrl||job.url)!,image:job.image,playbackRate:cmd?.playbackRate};
  if(variant==='hat')liveAssets[`${profile}:tayne:hat`]=liveAssets[key];
  report('generation-ready');events.push({kind:'generated-ready',url:job.url,previewUrl:job.previewUrl,id:job.id,playbackRate:cmd?.playbackRate||1,timings:job.timings,time:performance.now(),elapsedMs:performance.now()-startedAt,character,variant});return true;
 }catch(e){const message=variant==='face'?`Portrait generation failed: ${(e as Error).message}`:`Dance generation failed: ${(e as Error).message}`;report('generation-error',message);if(token===run&&epoch===generationEpoch){commandStatus.error(feedback,message);}events.push({kind:'generation-error',message:String(e)});return false;}finally{feed?.close();progress.done();commandStatus.jobDone(feedback,jobKey);}
}
async function customDance(cmd:Command){
 const term=terminal();term.classList.add('custom-terminal');const character=cmd.sequenceMode==='modify'?(cmd.target||context.character):cmd.label||'custom';
 placeWindow(term,{x:60,y:378,w:362,h:129,className:'terminal custom-terminal'});
 void type(`Computing ${character}...`);const epoch=++generationEpoch;
 if(!await prepareDance(character,'base',epoch,cmd))return false;
 context.character=character;context.costume=cmd.costume;
 dancer(character,{title:cmd.label||'NEW SEQUENCE',className:'custom-dancer',x:520,y:12,w:282,h:502});musicFor(character);void type(cmd.response);return true;
}
async function dispatch(text:string,source='keyboard',feedback?:number){
 if(!text.trim())return;const token=run,order=++commandEpoch;void unlockAudio();
 if(source!=='microphone'){microphoneTurn?.cancel();microphoneTurn=undefined;}
 const status=feedback??commandStatus.begin('Interpreting…',text,source==='microphone'?'Heard':'Command');feedbackToken=status;commandStatus.retry(status,()=>dispatch(text,'retry'));
 events.push({kind:'input',text,source,time:performance.now()});
 try{
  context.scriptStep=scriptGuide.nextIndex();
  // The blessed script answers first; the director takes only what it does not
  // recognize, and answers its own yes/no questions without the server.
  const known=scripted(text,context),local=directorOwnsTurn(known,context)?resolveLocally(text,context):known;
  commandStatus.phase(status,local?'Running command':'Interpreting command');
  // Performances get the recorded "Okay." at once; other turns wait for their route.
  let acknowledged=false;const acknowledge=()=>{if(acknowledged||token!==run||order!==commandEpoch)return;acknowledged=true;void speak({action:'custom',response:'Okay.',audio:'okay'});void type('Computing sequence...');};
  if(!local&&requestsPerformance(text))acknowledge();
  const cmd=local||await requestCommand<Command>({text,context,profile,fastPath},intent=>{if(intent.performance)acknowledge();});
  if(token!==run||order!==commandEpoch||!commandStatus.current(status))return;
  if(acknowledged&&cmd.action==='custom'){typing++;const content=desktop.querySelector('[data-id="terminal"] .content');if(content)content.textContent=`Computing ${cmd.label||'sequence'}...`;}
  context.history.push(text);context.history=context.history.slice(-12);
  context.conversation=[...(context.conversation||[]),{role:'user' as const,content:text},{role:'assistant' as const,content:cmd.response}].slice(-12);
  context.director=advanceDirector(context.director,cmd,context);
  const spoken=acknowledged&&(cmd.action==='custom'||(cmd.action==='director'&&cmd.beat?.kind==='reveal'));
  commandStatus.phase(status,'Preparing sequence');const applied=await apply(cmd,spoken);if(applied===false)return;if(token===run&&order===commandEpoch){scriptGuide.observe(text,cmd.action);commandStatus.finish(status);}events.push({kind:'command-complete',text,action:cmd.action,time:performance.now()});return cmd;
 }catch(e){if(token===run&&order===commandEpoch&&commandStatus.current(status)){const message=(e as Error).name==='TimeoutError'?'Computer timed out. Please try again.':(e as Error).message;commandStatus.error(status,message);typing++;const content=desktop.querySelector('[data-id="terminal"] .content');if(content)content.textContent='Command failed.';}throw e;}
}
async function receiveAudio(base64:string,mime='audio/webm',feedback?:number,recording?:{requestId:string;durationMs:number;peak:number;device:string},streaming?:TranscriptionTurn){
 if(feedback!==undefined&&!commandStatus.current(feedback))return;
 const token=run,status=feedback??commandStatus.begin('Transcribing…');feedbackToken=status;
 const requestId=recording?.requestId||crypto.randomUUID(),startedAt=performance.now();
 const capture=recording?`Mic #${recording.requestId.split('-').pop()} · ${(recording.durationMs/1000).toFixed(1)}s captured`:'';
 commandStatus.phase(status,`Transcribing${capture?' · '+capture:''}`);
 try{
  let result;
  if(streaming){
   try{result={...await streaming.finish(),requestId};if(incompleteTranscript(result.text)){events.push({kind:'transcription-incomplete',requestId,text:result.text});result=undefined;throw Error('Streaming transcript was incomplete');}}
   catch(error){
    if(token!==run||!commandStatus.current(status)||(error as Error).name==='AbortError')return;
    events.push({kind:'transcription-fallback',requestId,message:(error as Error).message});
    commandStatus.phase(status,'Transcribing recording…');
   }
  }
  if(token!==run||!commandStatus.current(status))return;
  result??=await api('transcribe',{audio:base64,mime,requestId});if(token!==run||!commandStatus.current(status))return;
  if(result.requestId!==requestId)throw Error('Transcript did not match this recording. Please try again.');
  const text=String(result.text||'').trim();events.push({kind:'transcription',text,requestId,recording,model:result.model,firstPartialMs:result.firstPartialMs,transcriptionMs:result.transcriptionMs,elapsedMs:performance.now()-startedAt});
  void api('client-event',{event:'transcription',requestId,model:result.model,message:text,durationMs:recording?.durationMs,elapsedMs:Math.round(performance.now()-startedAt)}).catch(()=>{});
  if(incompleteTranscript(text)){commandStatus.error(status,text?'Could not hear a complete command. Hold Record, wait for “Speak now”, then repeat.':'No speech heard. Settings → Replay mic to check the recording.');return;}
  commandStatus.echo(status,text);commandStatus.detail(status,`${capture||'Audio file'} · transcription ${(result.transcriptionMs/1000).toFixed(1)}s${recording?' · '+recording.device:''}`);
  return dispatch(text,'microphone',status);
 }catch(e){if(token===run&&commandStatus.current(status))commandStatus.error(status,(e as Error).name==='TimeoutError'?'Transcription timed out. Settings → Replay mic to check the recording.':(e as Error).message);throw e;}
}

function reset(){awaitingCall=false;generationOverlay.clear();microphoneTurn?.cancel();microphoneTurn=undefined;closeTranscription();commandStatus.clear();scriptGuide.reset();run++;generationEpoch++;commandEpoch++;musicEpoch++;stopSpeech();recordingRequested=false;clearTimeout(stopRecordingTimer);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;duckForMicrophone(false);clearTimers();typing++;music?.stop();music=null;ducks.clear();context={identity,character:'celery',pending:'',history:[]};desktop.classList.remove('alarm','flash');delete desktop.dataset.mode;clearWindows(false);started=false;replaying=false;setMicState('idle');fit();launch();}
async function begin(){scriptGuide.reset();void unlockAudio();if(streamingTranscription){warmTranscription();void prepareTranscription(speechBus().context).catch(()=>{});}void api('warm',{profile,name:identity}).catch(()=>{});clearWindows(false);started=true;fit();terminal();void readyMicrophone().catch(()=>{});await dispatch('Good morning','boot');}
function launch(){
 const existing=desktop.querySelector<HTMLElement>('.launch');if(existing){existing.classList.remove('minimized');existing.style.zIndex=String(++topZ);return;}
 let warmTimer:number;
 const t=launchIdentity({profile,name:identity,compact,windowBox,removeWindow,upload:image=>api('profile',{image}),
  select:person=>{clearTimeout(warmTimer);warmTimer=window.setTimeout(()=>void api('warm',{profile:person.id,name:person.name}).catch(()=>{}),500);},
  doubleClick:()=>{if(sound)playDesktopDoubleClick();},
  start:async(person,win,feedback)=>{
   // Start authorizes microphone setup; begin keeps the input warm for Space.
   preparePlayAndRecord();const ready=unlockAudio(),token=run;void microphone.refresh();
   await Promise.all([ready,feedback]);
   if(token!==run||!win.isConnected)return;
   mode='live';profile=person.id;identity=person.name;context.identity=identity;
   safeStorage.setItem('cinco-profile',profile);safeStorage.setItem('cinco-name',identity);
   await begin();
  }
 });
 t.win.addEventListener('windowclose',()=>clearTimeout(warmTimer));
}
async function replay(){scriptGuide.reset();void unlockAudio();run++;const token=run;clearTimers();clearWindows();stopSpeech();musicEpoch++;music?.stop();music=null;ducks.clear();context={identity,character:'celery',pending:'',history:[]};started=true;fit();replaying=true;terminal();let origin=performance.now();for(const step of sketch){await delay(Math.max(0,step.at*1000-(performance.now()-origin)));if(token!==run)return;if('keyboard'in step){if(sound)void new Clip('/media/original/keyboard.wav').play().catch(()=>{});}const before=performance.now();await dispatch(step.text,'sketch');if(mode==='live'&&performance.now()-before>250)origin+=performance.now()-before;}replaying=false;}
async function fileBase64(blob:Blob){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});}
// Keep the input device active for the session; Space only gates recording.
function readyMicrophone():Promise<MediaStream>{
 const token=run;if(microphoneOpening?.token===token)return microphoneOpening.promise;
 const promise=microphone.open(stream).then(opened=>{
  if(token!==run){opened.getTracks().forEach(t=>t.stop());throw new DOMException('Session ended','AbortError');}
  stream=opened;setMicBlocked(false);return opened;
 }).catch(error=>{if(microphoneBlocked(error))setMicBlocked(true);throw error;}).finally(()=>{if(microphoneOpening?.promise===promise){microphoneOpening=undefined;if(!recordingRequested)setMicState('idle');}});
 microphoneOpening={token,promise};if(!recordingRequested)inputControls.querySelector('.record-hint')!.textContent='Opening mic…';return promise;
}
async function startRecording(){
 recordingRequested=true;recordingCancelled=false;clearTimeout(stopRecordingTimer);
 if(recordingStarting||recorder?.state==='recording')return;
 recordingStarting=true;recordingCancelled=false;void unlockAudio();setMicState('opening');
 microphoneTurn?.cancel();microphoneTurn=undefined;if(streamingTranscription)warmTranscription();
 // Opening the microphone is not a replacement dance command. Keep pending
 // commands and generation alive, including when this recording is empty or
 // fails; dispatching the transcribed command is what supersedes them.
 typing++;stopSpeech();lastMicPlayback?.pause();duckForMicrophone(true);
 const recordingRun=run,status=commandStatus.begin('Opening microphone…');feedbackToken=status;
 const number=++recordingNumber,requestId=`${crypto.randomUUID()}-${number}`,openingAt=performance.now();
 events.push({kind:'microphone-opening',requestId,time:openingAt});
 try{
  const audioContext=speechBus().context;let streamingAvailable=false;
  // Recording must not wait for the optional streaming worklet to download.
  if(streamingTranscription)void prepareTranscription(audioContext).then(()=>{streamingAvailable=true;}).catch(()=>{});
  stream=await readyMicrophone();
  if(!recordingRequested||recordingRun!==run||!commandStatus.current(status)){duckForMicrophone(false);setMicState('idle');commandStatus.finish(status);return;}
  stream.getTracks().forEach(t=>t.enabled=true);
  commandStatus.detail(status,`Input: ${stream.getAudioTracks()[0]?.label||microphone.label}`);
  const activeStream=stream,chunks:Blob[]=[],mime=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
  const current=new MediaRecorder(activeStream,{mimeType:mime});recorder=current;
  const source=audioContext.createMediaStreamSource(activeStream),meter=audioContext.createAnalyser();meter.fftSize=2048;source.connect(meter);
  let turn:TranscriptionTurn|undefined;
  if(streamingAvailable){
   try{turn=new TranscriptionTurn(audioContext,activeStream,text=>{
    if(recordingRun!==run||!commandStatus.current(status))return;
    commandStatus.echo(status,text,'Hearing');events.push({kind:'transcription-partial',requestId,text,time:performance.now()});
   });microphoneTurn=turn;}catch{closeTranscription();}
  }
  const samples=new Float32Array(meter.fftSize);let peak=0;const began=performance.now();
  const interval=window.setInterval(()=>{meter.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);peak=Math.max(peak,rms);if(recordButton.dataset.state==='recording')commandStatus.phase(status,rms>.005?'Recording…':'Speak now · recording');},100);
  current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  current.onerror=()=>{commandStatus.error(status,'Microphone recording failed. Try again.');stopRecording();openInputSettings();};
  current.onstop=async()=>{
   clearInterval(interval);source.disconnect();meter.disconnect();
   if(recorder===current){duckForMicrophone(false);setMicState('idle');}
   if(recordingCancelled||recordingRun!==run||!commandStatus.current(status)){turn?.cancel();if(recordingCancelled)commandStatus.finish(status);return;}
   const blob=new Blob(chunks,{type:mime}),durationMs=performance.now()-began,device=activeStream.getAudioTracks()[0]?.label||'Default microphone';
   if(lastMicUrl)URL.revokeObjectURL(lastMicUrl);lastMicUrl=URL.createObjectURL(blob);
   const replay=dock.querySelector<HTMLButtonElement>('.replay-mic')!;replay.disabled=false;replay.title=`Replay mic #${number}: ${(durationMs/1000).toFixed(1)} seconds from ${device}`;
   commandStatus.echo(status,`${(durationMs/1000).toFixed(1)}s · Settings → Replay mic`,'Captured');
   events.push({kind:'microphone-capture',requestId,durationMs,peak,bytes:blob.size,device});
   if(durationMs<250||peak<.001){turn?.cancel();commandStatus.error(status,`Recording too short or quiet. Settings → Replay mic to check.`);return;}
   try{await receiveAudio(await fileBase64(blob),mime,status,{requestId,durationMs,peak,device},turn);}catch{/* receiveAudio keeps the failure in the input status. */}finally{turn?.cancel();if(microphoneTurn===turn)microphoneTurn=undefined;}
  };
  current.onstart=()=>{if(!recordingRequested||recordingCancelled||recordingRun!==run||!commandStatus.current(status))return;events.push({kind:'microphone-ready',requestId,openingMs:performance.now()-openingAt,time:performance.now()});commandStatus.phase(status,'Speak now · recording');setMicState('recording');};
  current.start();
 }catch(e){duckForMicrophone(false);setMicState('idle');commandStatus.error(status,microphoneBlocked(e)?'Microphone blocked by the browser.':`Microphone unavailable: ${(e as Error).message||microphone.label}. Use the gear to choose a microphone.`);
  // A mic that cannot open needs the device picker and error details, not just a status line.
  if(recordingRun===run)openInputSettings();}
 finally{recordingStarting=false;}
}
function stopRecording(){recordingRequested=false;const current=recorder;clearTimeout(stopRecordingTimer);if(current?.state==='recording')stopRecordingTimer=window.setTimeout(()=>{if(current.state==='recording')current.stop();},150);}
dock.querySelector('.replay-mic')!.addEventListener('click',()=>{if(!lastMicUrl||recorder?.state==='recording')return;stopSpeech();lastMicPlayback?.pause();lastMicPlayback=new Audio(lastMicUrl);routeAudio(lastMicPlayback);void lastMicPlayback.play();});
function setMicState(state:'idle'|'opening'|'recording'){
 if(state==='idle')recordingRequested=false;
 recordButton.dataset.state=state;recordButton.setAttribute('aria-pressed',String(state!=='idle'));
 recordButton.setAttribute('aria-label',state==='idle'?'Record (press and hold)':state==='opening'?'Opening microphone (wait to speak)':'Recording (release to send)');
 recordButton.querySelector('span')!.textContent=state==='opening'?'Opening…':state==='recording'?'Recording':'Record';
 inputControls.querySelector('.record-hint')!.textContent=state==='idle'?'':state==='opening'?'Wait for mic':pushToTalk?'Release Space':'Release to send';
}
recordButton.setAttribute('aria-label','Record (press and hold)');recordButton.setAttribute('aria-keyshortcuts','Space');recordButton.title='Hold Record or Space, wait for Speak now, then talk. Release to send.';
recordButton.addEventListener('pointerdown',event=>{
 if(event.button!==0||!event.isPrimary||recordingRequested||recorder?.state==='recording')return;
 event.preventDefault();recordButton.focus({preventScroll:true});recordingPointer=event.pointerId;
 recordButton.setPointerCapture(event.pointerId);void startRecording();
});
function releaseRecordPointer(event:PointerEvent,cancelled=false){
 if(event.pointerId!==recordingPointer)return;recordingPointer=undefined;
 if(recordButton.hasPointerCapture(event.pointerId))recordButton.releasePointerCapture(event.pointerId);
 recordingCancelled=cancelled;stopRecording();
}
recordButton.addEventListener('pointerup',event=>releaseRecordPointer(event));
recordButton.addEventListener('pointercancel',event=>releaseRecordPointer(event,true));
recordButton.addEventListener('lostpointercapture',event=>releaseRecordPointer(event,true));
recordButton.addEventListener('contextmenu',event=>event.preventDefault());
function openInputSettings(){
 const existing=desktop.querySelector<HTMLElement>('.input-settings');
 if(existing){existing.classList.remove('minimized');existing.style.zIndex=String(++topZ);existing.querySelector<HTMLDetailsElement>('.activity-details')!.open||=activity.classList.contains('has-error')||activity.classList.contains('has-warning');return;}
 const t=windowBox({title:'Microphone',x:250,y:160,w:460,h:260,className:'input-settings'});
 t.win.setAttribute('role','dialog');microphone.mount(t.content);
 const details=document.createElement('details');details.className='activity-details';
 const summary=document.createElement('summary');summary.textContent='Activity';details.append(summary,diagnostics);
 details.open=activity.classList.contains('has-error')||activity.classList.contains('has-warning');
 dock.classList.remove('hidden');t.content.append(details,dock);
 t.win.addEventListener('windowclose',()=>settingsButton.focus(),{once:true});
 t.content.querySelector('select')?.focus();
}
settingsButton.onclick=openInputSettings;
microphone.subscribe(label=>{const name=inputControls.querySelector<HTMLElement>('.input-microphone')!;name.textContent=label;name.title=label;settingsButton.title=`Microphone settings: ${label}`;});
dock.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.onclick=()=>{switch(b.dataset.tool){case'identity':launch();break;case'printout':showPrintout();break;case'replay':void replay();break;case'reset':reset();break;case'sound':sound=!sound;b.textContent=sound?'Sound on':'Sound off';if(!sound)stopSpeech();musicLevel();syncSequenceMusic();break;}});
addEventListener('keydown',e=>{
 if(e.key==='F1'){e.preventDefault();const settings=desktop.querySelector('.input-settings');if(settings)removeWindow(settings);else openInputSettings();return;}
 if(e.key==='Escape'){const settings=desktop.querySelector('.input-settings');if(settings){e.preventDefault();removeWindow(settings);}return;}
 const target=e.target instanceof Element?e.target:null;
 if(e.code!=='Space'||!started||target?.closest('input,textarea,select,[contenteditable="true"],.launch,.identity-upload,.input-settings')||target?.closest('button:not(.record-button)'))return;
 e.preventDefault();if(e.repeat||recordingRequested||recorder?.state==='recording')return;pushToTalk=true;void startRecording();
});
addEventListener('keyup',e=>{if(e.code==='Space'&&pushToTalk){e.preventDefault();pushToTalk=false;stopRecording();}});
function cancelHeldRecording(){if(pushToTalk||recordingPointer!==undefined){pushToTalk=false;recordingPointer=undefined;recordingCancelled=true;stopRecording();}}
document.addEventListener('visibilitychange',()=>{if(document.hidden)cancelHeldRecording();});
addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());});
addEventListener('blur',cancelHeldRecording);
Object.assign(window,{cinco:{playInputAudio:(src:string)=>{const a=new Audio(src);routeAudio(a);void a.play();},startOutputCapture,stopOutputCapture,dispatch,receiveAudio,apply,events,reset,replay,state:()=>({music:music?.state(),ducks:[...ducks],mode,fastPath,streamingTranscription,liveAssets,profile,context,lastPrint,started,replaying,windows:desktop.querySelectorAll('.window').length}),setIdentity:(id:string,name:string)=>{profile=id;identity=name;context.identity=name;},setMode:(v:'live'|'reference')=>{mode=v;},setSound:(v:boolean)=>{sound=v;if(!sound)stopSpeech();musicLevel();syncSequenceMusic();},settle:()=>delay(1800)}});
// Verify with Turnstile while the identity launcher is open, off the command path.
prewarmSession();
launch();
for(const name of ['okay','yes','greeting','hat','flower'])void preloadAudio(`/media/original/${name}.wav`).catch(()=>{});
