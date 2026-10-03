import {MicrophoneDevices} from './microphone-device';
import './style.css';
import {createCommandStatus} from './command-status';
import {createScriptGuide} from './script-guide';
import {StreamingSpeech} from './streaming-speech';
import hatTrack from './hat-track.json';
import {routeAudio,unlockAudio,speechBus,duckForMicrophone,startOutputCapture,stopOutputCapture,MusicLoop} from './audio';
import {sketch,scripted,type Command,type Context} from './protocol';
import {costumes,motions} from './dances';
const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML=`<main class="viewport"><section class="desktop" aria-label="Cinco desktop"><div class="hint" title="Show controls">F1 · controls</div><form class="dock hidden"><span class="lamp"></span><button type="button" class="classic-button mic">Microphone</button><button type="button" class="classic-button" data-tool="input">Input device</button><button type="button" class="classic-button replay-mic" disabled title="Replay the exact audio sent for transcription">Replay mic</button><input aria-label="Computer command" placeholder="Computer…" autocomplete="off"><button class="classic-button">Enter</button><button type="button" class="classic-button" data-tool="identity">Identity</button><button type="button" class="classic-button" data-tool="replay">Sketch</button><button type="button" class="classic-button" data-tool="pause">Pause</button><button type="button" class="classic-button" data-tool="printout">Printout</button><button type="button" class="classic-button" data-tool="sound">Sound on</button><button type="button" class="classic-button" data-tool="reset">Reset</button><button type="button" class="classic-button" data-tool="hide">×</button></form></section></main>`;
const desktop=document.querySelector<HTMLElement>('.desktop')!,dock=document.querySelector<HTMLFormElement>('.dock')!,input=dock.querySelector('input')!;
const debugBar=document.createElement('div');debugBar.className='debug-bar';debugBar.setAttribute('role','group');debugBar.setAttribute('aria-label','Debug diagnostics');debugBar.innerHTML='<span class="debug-bar-badge">DEBUG</span>';desktop.append(debugBar);
const commandStatus=createCommandStatus(debugBar,()=>{
 const videos=[...desktop.querySelectorAll<HTMLVideoElement>('video')];
 if(videos.some(v=>!v.paused&&v.readyState>=2))return desktop.classList.contains('finale')?`Playing finale · ${videos.length} windows · ready for command`:`Idle · playing ${videos.find(v=>!v.paused&&v.readyState>=2)?.dataset.sequence||context.character}`;
 if(videos.length&&videos.every(v=>v.paused))return 'Idle · playback paused';
 return 'Waiting for command · hold Space to talk';
});let feedbackToken=0;
const scriptGuide=createScriptGuide(debugBar);
let profile=localStorage.getItem('cinco-profile')||'paul',identity=localStorage.getItem('cinco-name')||'Paul';
let context:Context={identity,character:'celery',pending:'',history:[]};
let mode:'live'|'reference'='live';
const liveAssets:Record<string,{url:string;image?:string;playbackRate?:number}>={};
let generationEpoch=0;
let topZ=10,winCount=0,typing=0,started=false,sound=true,paused=false,run=0,replaying=false;
let timers:number[]=[],music:MusicLoop|null=null,speech:HTMLAudioElement|null=null;
let streamedSpeech:StreamingSpeech|undefined;
let speechEpoch=0,musicEpoch=0,commandEpoch=0;
let finishSpeechStatus:(()=>void)|undefined;
let mediaStatusId=0;const mediaStatusCleanup=new WeakMap<HTMLVideoElement,()=>void>();
const ducks=new Set<string>();
function musicLevel(){if(music)music.volume=sound?(ducks.size?.16:.6):0;}
function stopSpeech(){finishSpeechStatus?.();finishSpeechStatus=undefined;speechEpoch++;streamedSpeech?.stop();streamedSpeech=undefined;speech?.pause();ducks.delete('speech');musicLevel();}
let lastPrint:{image:string;character:string}|undefined;
let recorder:MediaRecorder|null=null,stream:MediaStream|null=null;
let recordingRequested=false,recordingStarting=false,pushToTalk=false,recordingNumber=0;
let stopRecordingTimer:number|undefined,lastMicUrl='',lastMicPlayback:HTMLAudioElement|undefined;
const microphone=new MicrophoneDevices(()=>{stream?.getTracks().forEach(t=>t.stop());stream=null;},()=>recordingStarting||recorder?.state==='recording');
const events:any[]=[];
const spokenLines:Record<string,string>={'okay':'Okay.','print':'Okay.','confirm':'Okay.','yes':'Yes.','hat':'Yes.','flower':'Yes.','yes-paul':'Yes, Paul!','greeting':'Good morning Paul. What will your first sequence of the day be?','beta':"I have a beta sequence I've been working on. Would you like to see it?",'repeat':'Not computing. Please repeat.','nsfw':'This is not suitable for work. Are you sure?','call':"Excuse me Paul. Your wife is on the phone. It's an emergency."};
const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const schedule=(fn:()=>void,ms:number)=>{const id=window.setTimeout(fn,ms);timers.push(id);return id;};
const api=async(url:string,body?:unknown)=>{const r=await fetch('/api/'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});const b=await r.json();if(!r.ok)throw Error(b.error||'Computer is not responding.');return b;};
function fit(){desktop.style.transform=`scale(${Math.min(innerWidth/960,innerHeight/540)})`;}addEventListener('resize',fit);fit();
function notify(message:string){document.querySelector('.toast')?.remove();const e=document.createElement('div');e.className='toast';e.textContent=message;desktop.append(e);setTimeout(()=>e.remove(),7000);}
type W={title:string;x:number;y:number;w:number;h:number;className?:string;menu?:string;blue?:boolean;id?:string};
function windowBox(o:W){
 const win=document.createElement('section');win.className=`window active ${o.className||''}`;win.dataset.id=o.id||`window-${++winCount}`;win.setAttribute('aria-label',o.title);win.style.cssText=`left:${o.x}px;top:${o.y}px;width:${o.w}px;height:${o.h}px;z-index:${++topZ}`;
 const bar=document.createElement('header');bar.className=`titlebar ${o.blue?'blue':''}`;
 bar.innerHTML='<button class="sys" aria-label="Window menu"><i class="window-dash"></i></button><span></span><button class="close" aria-label="Close window">Close</button><button class="min" aria-label="Minimize window">▾</button><button class="max" aria-label="Maximize window">▴</button>';
 bar.querySelector('span')!.textContent=o.title;win.append(bar);
 if(o.menu!==undefined){const m=document.createElement('div');m.className='menu-line';m.textContent=o.menu;win.append(m);}
 const content=document.createElement('div');content.className='content';win.append(content);const bottom=document.createElement('div');bottom.className='bottom-edge';win.append(bottom);
 const handle=document.createElement('div');handle.className='resize';handle.setAttribute('aria-label','Resize window');win.append(handle);
 win.addEventListener('pointerdown',()=>{win.style.zIndex=String(++topZ);});
 bar.querySelector('.close')!.addEventListener('click',()=>removeWindow(win));bar.querySelector('.min')!.addEventListener('click',()=>win.classList.toggle('minimized'));
 bar.querySelector('.sys')!.addEventListener('click',()=>{const prior=win.querySelector('.window-menu');if(prior){prior.remove();return;}const menu=document.createElement('div');menu.className='window-menu';for(const [label,selector]of [['Minimize','.min'],['Maximize / restore','.max'],['Close','.close']]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{menu.remove();(bar.querySelector(selector) as HTMLButtonElement).click();};menu.append(b);}win.append(menu);});
 let saved='';bar.querySelector('.max')!.addEventListener('click',()=>{if(saved){win.style.cssText=saved;saved='';}else{saved=win.style.cssText;Object.assign(win.style,{left:'8px',top:'8px',width:'944px',height:'524px'});}});
 function drag(e:PointerEvent,resize=false){if((e.target as HTMLElement).closest('button'))return;e.preventDefault();const scale=desktop.getBoundingClientRect().width/960,sx=e.clientX,sy=e.clientY,x=win.offsetLeft,y=win.offsetTop,w=win.offsetWidth,h=win.offsetHeight;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);const el=e.currentTarget as HTMLElement;
  const move=(ev:PointerEvent)=>{const dx=(ev.clientX-sx)/scale,dy=(ev.clientY-sy)/scale;if(resize){win.style.width=Math.max(120,w+dx)+'px';win.style.height=Math.max(60,h+dy)+'px';}else{win.style.left=Math.max(-w+40,Math.min(920,x+dx))+'px';win.style.top=Math.max(0,Math.min(515,y+dy))+'px';}};
  const end=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',end);};el.addEventListener('pointermove',move);el.addEventListener('pointerup',end);
 }bar.addEventListener('pointerdown',e=>drag(e));handle.addEventListener('pointerdown',e=>drag(e,true));desktop.append(win);return {win,content};
}
function removeWindow(win:Element){
 // Detached media can retain decoders and pending playback jobs until explicitly unloaded.
 win.remove();win.querySelectorAll('video').forEach(v=>{
  mediaStatusCleanup.get(v)?.();mediaStatusCleanup.delete(v);v.pause();v.removeAttribute('src');v.load();
 });
}
function clearWindows(){desktop.classList.remove('finale');ducks.delete('intro');musicLevel();desktop.querySelectorAll('.window,.free-dancer').forEach(removeWindow);}
function clearTimers(){timers.forEach(clearTimeout);timers=[];}
function terminal(large=false){let win=desktop.querySelector<HTMLElement>('[data-id="terminal"]');if(win)return win;
 const t=windowBox({title:`${identity}'s COMPUTER`,x:60,y:405,w:362,h:101,id:'terminal',className:`terminal ${large?'large':''}`});
 if(large)Object.assign(t.win.style,{left:'204px',top:'147px',width:'532px',height:'283px'});
 t.win.querySelector('.bottom-edge')!.remove();const drive=document.createElement('div');drive.className='drive';drive.innerHTML='<span>▧ C　　　　　　　　　　　　　　　　　↕</span>';t.win.append(drive);const status=document.createElement('div');status.className='status';status.textContent='▱₁  ▱₂';t.win.append(status);
 const commandInput=document.createElement('input');commandInput.className='terminal-input';commandInput.setAttribute('aria-label','Terminal command');t.win.append(commandInput);
 const content=t.content;content.addEventListener('click',()=>{commandInput.value='';commandInput.focus();});
 commandInput.oninput=()=>{typing++;content.textContent=commandInput.value;const cursor=document.createElement('i');cursor.className='cursor';content.append(cursor);};
 commandInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const text=commandInput.value;commandInput.value='';commandInput.blur();void dispatch(text,'keyboard').catch(e=>notify(e.message));}};
 return t.win;
}
async function type(text:string,large=false){const n=++typing,status=feedbackToken,key=`typing:${n}`,t=terminal(large),c=t.querySelector('.content')!;commandStatus.job(status,key,'Typing response');try{c.textContent='';const span=document.createElement('span'),cursor=document.createElement('i');cursor.className='cursor';c.append(span,cursor);for(const ch of text){if(n!==typing)return;span.textContent+=ch;c.scrollTop=c.scrollHeight;await delay(22);}events.push({kind:'terminal',text,time:performance.now()});}finally{commandStatus.jobDone(status,key);}}
function videoSource(character:string,variant=''){if(mode==='reference')return `/media/original/${variant||character}.mp4`;const key=variant.endsWith('-face')?'face':variant==='tayne-intro'?'intro':variant==='tayne-squat'?'base':variant==='tayne-sway'?'sway':variant||'base';return liveAssets[`${profile}:${character}:${key}`]?.url||liveAssets[`${profile}:${character}:base`]?.url||'';}
function dancer(character:string,o:Partial<W>={},variant='',url?:string,deferPlayback=false){
 const face=variant.includes('face')||variant==='hat';const title=character==='celery'?'CINCO ID':character==='oyster'?'OYSTER':'Tayne';
 const t=windowBox({title,x:520,y:12,w:282,h:502,menu:'',...o});
 const v=document.createElement('video');const source=url||videoSource(character,variant);if(!source){t.content.textContent='Sequence not loaded.';return t;}v.src=source;v.poster=mode==='live'?(liveAssets[`${profile}:${character}:${variant==='hat'?'hat':variant.includes('face')?'face':variant==='tayne-intro'?'intro':'base'}`]?.image||''):'';v.playbackRate=liveAssets[`${profile}:${character}:${variant||'base'}`]?.playbackRate||1;v.muted=true;v.loop=true;v.autoplay=!paused&&!deferPlayback;v.playsInline=true;v.dataset.character=character;v.dataset.sequence=character==='celery'?'Celery Man':character;v.className=face?'face-video':mode==='live'&&variant==='tayne-intro'?'intro-video':'';t.content.append(v);
 const status=feedbackToken,key=`video:${++mediaStatusId}`;commandStatus.job(status,key,'Loading video');
 const done=()=>{clearTimeout(timeout);commandStatus.jobDone(status,key);};
 const timeout=window.setTimeout(()=>{if(v.isConnected){commandStatus.error(status,'Video is not playing. Try the command again.');}done();},30000);
 mediaStatusCleanup.set(v,done);v.addEventListener('playing',done,{once:true});v.addEventListener('loadeddata',()=>{if(paused)done();},{once:true});
 v.addEventListener('error',()=>{done();if(!v.isConnected)return;commandStatus.error(status,'Video playback failed. Try the command again.');t.content.textContent='Sequence unavailable. Open controls to regenerate.';events.push({kind:'media-error',url:v.src});});if(!paused&&!deferPlayback)void v.play().catch((error:Error)=>{if(!v.isConnected||error.name==='AbortError')return;done();commandStatus.error(status,`Video playback failed: ${error.message}`);});return t;
}
function portrait(character:string){return dancer(character,{title:'',x:125,y:62,w:375,h:332,menu:character==='celery'?'Celery Man':character==='oyster'?'Celery Man':'Tayne',blue:true,className:'portrait'},character+'-face');}
function musicFor(character:string){
 const token=++musicEpoch,source=['celery','oyster','tayne','chaos'].includes(character)?`/media/original/music-${character}.wav`:videoSource(character);
 if(music?.url===source){if(!paused)void music.play();return;}
 const status=feedbackToken,key=`music:${token}`;commandStatus.job(status,key,'Loading music');const next=new MusicLoop(source,!source.includes('/original/'));next.volume=0;
 void next.ready.then(()=>{if(token!==musicEpoch){next.stop();commandStatus.jobDone(status,key);return;}music?.stop();music=next;musicLevel();if(!paused)void music.play();commandStatus.jobDone(status,key);events.push({kind:'music-playing',url:source,time:performance.now()});}).catch(e=>{next.stop();commandStatus.error(status,'Music could not load. Try the command again.');commandStatus.jobDone(status,key);events.push({kind:'music-error',message:String(e)});});
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
   onStart:()=>{if(epoch!==speechEpoch||!sound)return;commandStatus.job(status,key,'Speaking');ducks.add('speech');musicLevel();events.push({kind:'audio-playing',src,text:cmd.response,spokenText:cmd.response,latencyMs:performance.now()-requestedAt,time:performance.now()});},
   onEnd:()=>{release();events.push({kind:'voice-ended',text:cmd.response,time:performance.now()});},
   onError:error=>{release();if(epoch===speechEpoch){commandStatus.error(status,`Voice unavailable: ${error.message}`);notify(`Voice unavailable: ${error.message}`);events.push({kind:'voice-error',message:error.message});}},
   onComplete:summary=>events.push({kind:'voice-stream-complete',text:cmd.response,...summary,time:performance.now()})
  });streamedSpeech=current;await current.started;return;
 }
 try{const src=`/media/original/${cmd.audio}.wav`;
  if(epoch!==speechEpoch||!sound)return;const current=new Audio(src);routeAudio(current);speech=current;current.volume=1;
  const release=()=>{done();if(epoch===speechEpoch){ducks.delete('speech');musicLevel();}};
  events.push({kind:'audio',src,text:cmd.response,spokenText:cmd.audio?(spokenLines[cmd.audio]||cmd.response):cmd.response,time:performance.now()});
  current.onplaying=()=>{if(epoch!==speechEpoch)return;commandStatus.job(status,key,'Speaking');ducks.add('speech');musicLevel();events.push({kind:'audio-playing',src,text:cmd.response,spokenText:cmd.audio?(spokenLines[cmd.audio]||cmd.response):cmd.response,time:performance.now()});};
  current.onended=release;current.onpause=release;current.onerror=()=>{release();commandStatus.error(status,'Voice playback failed');events.push({kind:'voice-error',src,message:current.error?.message});};await current.play();
 }catch(e){done();if(epoch===speechEpoch){ducks.delete('speech');musicLevel();commandStatus.error(status,`Voice unavailable: ${(e as Error).message}`);notify(`Voice unavailable: ${(e as Error).message}`);}events.push({kind:'voice-error',message:String(e)});}
}
function loading(label:string,boot=false){const t=windowBox({title:'Cinco Identity Generator 2.5',x:boot?221:221,y:boot?70:209,w:526,h:boot?362:157,className:'boot',id:'loader'});
 if(boot){const art=document.createElement('div');art.className='identity-art';art.innerHTML=`<svg viewBox="0 0 140 180" aria-label="Wireframe identity"><defs><pattern id="grid" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M12 0H0V12" fill="none" stroke="#49b6c9" stroke-width=".65"/></pattern><clipPath id="head"><path d="M35 174L40 142 31 120 22 92 24 50Q28 10 70 6Q112 10 116 50L118 92 109 120 100 142 105 174Z"/></clipPath></defs><path d="M35 174L40 142 31 120 22 92 24 50Q28 10 70 6Q112 10 116 50L118 92 109 120 100 142 105 174Z" fill="#146884"/><rect width="140" height="180" fill="url(#grid)" clip-path="url(#head)"/><path d="M70 7Q34 82 70 172M70 7Q105 82 70 172M24 70Q70 94 116 70M28 110Q70 130 112 110" stroke="#60c5cd" fill="none" stroke-width=".6"/></svg>`;t.content.append(art);const brand=document.createElement('div');brand.className='brand';brand.textContent='Cinco Identity Generator 2.5';t.content.append(brand);}
 const p=document.createElement('div');p.className='progress';p.innerHTML='<i></i>';t.content.append(p);const l=document.createElement('div');l.className='loading-label';l.textContent=label;t.content.append(l);return t;
}
function showCelery(){clearWindows();terminal();dancer('celery');portrait('celery');musicFor('celery');}
function showTayne(){
 clearWindows();const intro=dancer('tayne',{x:482,y:14},'tayne-intro',undefined,true),v=intro.content.querySelector('video');musicFor('tayne');if(!v)return;
 const status=feedbackToken,key='tayne-introduction';commandStatus.job(status,key,'Playing Tayne introduction');
 const release=()=>{ducks.delete('intro');musicLevel();};let transitioned=false;
 const advance=()=>{if(transitioned||!intro.win.isConnected)return;transitioned=true;commandStatus.jobDone(status,key);release();
  clearWindows();dancer('tayne',{x:70,y:30,w:245,h:455},'tayne-sway');const right=dancer('tayne',{x:680,y:30,w:245,h:455},'tayne-sway');right.content.querySelector('video')!.style.transform='scaleX(-1)';const t=windowBox({title:'OYSTER',x:320,y:100,w:360,h:320,menu:''});t.content.innerHTML=`<div class="name-card"><svg viewBox="0 0 56 30" aria-label="TAYNE"><path d="M0 1H10V5H7V29H4V5H0Z M11 29V10H13V5H15V1H18V5H20V10H22V29H19V19H14V29Z M14 10V16H19V10H17V6H16V10Z M23 1H26V10H28V14H30V10H32V1H35V13H32V17H31V29H28V17H26V13H23Z M36 29V1H39V7H41V13H43V1H46V29H43V21H41V15H39V29Z M47 1H56V5H50V13H55V17H50V25H56V29H47Z" fill="black" fill-rule="evenodd"/></svg></div>`;
  schedule(()=>{clearWindows();for(let i=0;i<7;i++)dancer('tayne',{x:233+i*36,y:28+[0,25,55,73,52,22,-2][i],w:282,h:502},'tayne-squat');},3700);
 };
 v.loop=false;
 if(mode==='live'){routeAudio(v);v.muted=!sound;v.addEventListener('playing',()=>{ducks.add('intro');musicLevel();});v.addEventListener('ended',advance,{once:true});}
 else {v.muted=true;v.addEventListener('playing',()=>{void speak({action:'tayne',response:"Hey Paul. I'm Tayne, your latest dancer. I can't wait to entertain you.",audio:'intro'});schedule(advance,4800);},{once:true});}
 v.addEventListener('pause',release);v.addEventListener('error',()=>{release();commandStatus.jobDone(status,key);});
 const previousCleanup=mediaStatusCleanup.get(v);mediaStatusCleanup.set(v,()=>{previousCleanup?.();commandStatus.jobDone(status,key);release();});
 if(!paused)void v.play().catch(error=>{commandStatus.error(status,`Tayne introduction could not play: ${error.message}`);});
}

function showHat(){
 clearWindows();const term=terminal();Object.assign(term.style,{left:'72px',top:'390px'});
 // Recorded front-window rectangles from the sketch; scale chrome with the window.
 const hatStart=performance.now();const create=(box:number[])=>{const scale=box[2]/901;const t=dancer('tayne',{title:'',menu:'Tayne',blue:true,x:box[0]/2-23.5*scale,y:box[1]/2-56*scale,w:476,h:410,className:'portrait hat-cascade'},'hat');t.win.style.transformOrigin='top left';t.win.style.transform=`scale(${scale})`;const v=t.content.querySelector('video')!;v.addEventListener('loadeddata',()=>{v.currentTime=(performance.now()-hatStart)/1000%v.duration;},{once:true});return t.win;};
 create(hatTrack[0]);let front=create(hatTrack[0]);
 hatTrack.forEach((box,i)=>{if(!i)return;schedule(()=>{if(i<=20&&i%5===0)front=create(box);const scale=box[2]/901;Object.assign(front.style,{left:box[0]/2-23.5*scale+'px',top:box[1]/2-56*scale+'px',transform:`scale(${scale})`});if(i>20&&i%5===0)front=create(box);},i*1000/29.97);});
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
function showPrintout(){if(!lastPrint){notify('No pages in the print queue.');return;}const t=windowBox({title:`Print Manager — ${lastPrint.character.toUpperCase()}`,x:340,y:84,w:280,h:357,className:'print-preview',id:'print'});const img=document.createElement('img');img.src=lastPrint.image;img.alt=`${identity} smiling as ${lastPrint.character}`;t.content.append(img);const label=document.createElement('small');label.textContent='1 page spooled • virtual printer';t.content.append(label);const b=document.createElement('button');b.className='classic-button';b.textContent='Save printout';b.onclick=()=>{const a=document.createElement('a');a.href=img.src;a.download=`${lastPrint!.character}-smiling.png`;a.click();};t.content.append(b);}
function showCall(){
 desktop.classList.add('alarm');const main=desktop.querySelector<HTMLElement>('.window:not(.terminal)');if(main)Object.assign(main.style,{left:'345px',top:'16px',width:'282px',height:'503px'});
 const t=windowBox({title:'',blue:true,menu:'INCOMING CALL',x:398,y:126,w:150,h:225,className:'phone',id:'call'});
 t.content.innerHTML='<div class="number">545-33448</div><div class="phone-screen"><svg class="receiver" viewBox="0 0 64 70" aria-label="Telephone"><path d="M15 14Q8 39 47 53" fill="none" stroke="white" stroke-width="12" stroke-linecap="round"/><path d="M14 9L22 20M42 49L53 52" stroke="white" stroke-width="14" stroke-linecap="round"/><path d="M30 7L27 16M39 11L32 19M44 19L35 23" stroke="white" stroke-width="3"/></svg><div class="label">WIFE</div></div>';
 void speak({action:'call',response:`Excuse me ${identity}. Your wife is on the phone. It's an emergency.`,audio:profile==='paul'?'call':undefined});events.push({kind:'action',action:'call',time:performance.now()});
}
function chaos(){
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
 for(let i=0;i<2;i++)schedule(()=>{const t=add(()=>windowBox({title:'Cinco Identity Generator 2.5',x:223+i*18,y:217+i*22,w:526,h:162,className:'error'}));t.content.textContent='ERROR: BETA TAYNE\nIMPROPER CODING';},970+i*80);
 const available=['tayne','celery','oyster','mozzarell'].filter(c=>mode==='reference'||videoSource(c));
 for(let i=0;i<16;i++)schedule(()=>{
  const c=available[i%available.length]||'mozzarell';
  add(()=>dancer(c,{title:c==='celery'?'CINCO ID':c.toUpperCase(),x:20+(i*137)%640,y:68+(i*67)%210,w:280,h:245,menu:undefined,className:'chaos-portrait'},c==='tayne'?'hat':c+'-face'));
 },2100+i*180);
}
function presentSequence(show:()=>void,ms:number){const status=feedbackToken,order=commandEpoch,token=run;commandStatus.job(status,'presentation','Opening sequence');schedule(()=>{if(order===commandEpoch&&token===run)show();commandStatus.jobDone(status,'presentation');},ms);}
async function apply(cmd:Command,acknowledged=false){
 const preparingAt=performance.now();events.push({kind:'action',...cmd,time:performance.now()});if(cmd.action==='reaction')return;clearTimers();if(desktop.classList.contains('finale')&&!['pause','resume','attention'].includes(cmd.action))clearWindows();if(!['attention','pause','resume'].includes(cmd.action))context.pending='';
 if(!acknowledged&&cmd.action!=='greeting'&&(cmd.audio||['celery','attention','pause','resume','custom'].includes(cmd.action)))void speak(cmd);
 const generating=(['celery','oyster','tayne','hat','flarhgunnstow','print'].includes(cmd.action)||(cmd.action==='engage'&&context.character==='celery'));
 if(mode==='live'&&generating){const epoch=++generationEpoch;const character=cmd.action==='engage'?'celery':['hat','flarhgunnstow'].includes(cmd.action)?'tayne':cmd.action==='print'?(cmd.target||context.character):cmd.action;const variant=cmd.action==='engage'?'engaged':cmd.action==='hat'?'hat':cmd.action==='flarhgunnstow'?'flarhgunnstow':cmd.action==='print'?'smile':'base';
  const work=[prepareDance(character,variant,epoch,cmd.action==='print'?cmd:undefined)];
  if(variant==='base'&&['celery','oyster'].includes(character))work.push(prepareDance(character,'face',epoch,undefined,true));
  if(character==='tayne'&&variant==='base')work.push(prepareDance(character,'intro',epoch,undefined,true),prepareDance(character,'sway',epoch,undefined,true));
  const ready=await Promise.all(work);if(ready.some(ok=>!ok))return;
 }
 if(mode==='live'&&cmd.action==='chaos'){const epoch=++generationEpoch;const ready=await Promise.all([prepareDance('mozzarell','base',epoch),prepareDance('mozzarell','face',epoch,undefined,true)]);if(ready.some(ok=>!ok))return;}
 if(cmd.action==='reset'){reset();return;}
 if(cmd.action==='greeting'){clearWindows();const loader=loading('Preparing computer voice, please wait...',true);const speaking=speak(cmd),epoch=speechEpoch;await speaking;if(epoch!==speechEpoch)return;loader.content.querySelector('.loading-label')!.textContent='please wait...';schedule(()=>loader.win.remove(),4000);void type(cmd.response);}
 if(cmd.action==='celery'){context.character='celery';context.costume=costumes.celery;clearWindows();loading('Loading CELERY MAN, please wait...');void type(cmd.response);presentSequence(showCelery,mode==='live'?Math.max(0,1500-(performance.now()-preparingAt)):1500);}
 if(cmd.action==='engage'){desktop.querySelectorAll('video').forEach(v=>{if(v.dataset.character==='celery'&&!v.classList.contains('face-video')){v.dataset.sequence='Celery Man / 4d3d3d3';v.src=videoSource('celery','engaged');void v.play();}else v.playbackRate=1.4;});void type(cmd.response);}
 if(cmd.action==='oyster'){context.character='oyster';context.costume=costumes.oyster;portrait('oyster');dancer('oyster',{x:421,y:47,w:487,h:424});musicFor('oyster');void type(cmd.response);}
 if(cmd.action==='print'){const character=cmd.target||context.character;const image=mode==='reference'?'/media/original/oyster-face.png':liveAssets[`${profile}:${character}:smile`]?.image||'';lastPrint={image,character};events.push({kind:'print-spooled',...lastPrint,time:performance.now()});}
 if(cmd.action==='attention'||cmd.action==='cancel')void type(cmd.response);
 if(cmd.action==='beta'){clearWindows();music?.pause();context.pending='beta';void type(cmd.response,true);}
 if(cmd.action==='tayne'){context.character='tayne';context.costume=costumes.tayne;clearWindows();loading('Loading BETA, please wait...');presentSequence(showTayne,mode==='live'?Math.max(0,1150-(performance.now()-preparingAt)):1150);}
 if(cmd.action==='hat'){context.character='tayne';showHat();void type(cmd.response);}
 if(cmd.action==='flarhgunnstow'){showFlower();void type(cmd.response);}
 if(cmd.action==='repeat'){context.pending='repeat';void type(cmd.response);}
 if(cmd.action==='nsfw'){context.pending='nsfw';clearWindows();dancer('tayne',{x:596,y:18,w:282,h:501},'tayne-sway');const t=windowBox({title:'Cinco Identity Generator 2.5',x:325,y:278,w:525,h:162,className:'nsfw'});t.content.textContent='NSFW';}
 if(cmd.action==='confirm'){clearWindows();dancer('tayne',{x:345,y:16,w:282,h:503},'tayne-sway');desktop.classList.add('flash');schedule(()=>desktop.classList.remove('flash'),600);schedule(showCall,6900);}
 if(cmd.action==='call')showCall();
 if(cmd.action==='chaos')chaos();
 if(cmd.action==='pause'||cmd.action==='resume'){paused=cmd.action==='pause';desktop.classList.toggle('paused',paused);desktop.querySelectorAll('video').forEach(v=>paused?v.pause():void v.play());if(paused)music?.pause();else void music?.play();}
 if(cmd.action==='custom'){await customDance(cmd);}

}
async function prepareDance(character:string,variant:string,epoch:number,cmd?:Command,quiet=false){
 const l=loading('Compiling personalized sequence, please wait...');if(quiet)l.win.style.display='none';const token=run;const key=`${profile}:${character}:${variant}`;
 const startedAt=performance.now(),feedback=feedbackToken,jobKey=`${epoch}:${key}`;
 const describe=(stage:string)=>`${stage} (${variant==='face'?'portrait':variant==='base'?'dancer':variant})`;
 commandStatus.job(feedback,jobKey,describe('Loading'));
 try{const req={profile,character,variant,...(cmd?.playbackRate?{playbackRate:cmd.playbackRate}:{}),canonical:!cmd&&['celery','oyster','tayne','mozzarell'].includes(character),motion:variant==='intro'?`Tight head-and-shoulders close up. Face fills most of the vertical frame, head and upper chest only. Light gray background. Look at camera and say in a warm natural American male voice: Hey ${identity}. I'm Tayne, your latest dancer. I can't wait to entertain you. Keep the same clothing, face, and fixed camera.`:cmd?.motion||motions[variant]||motions[character],costume:cmd?.costume||costumes[character]||costumes.tayne};
  let job=cmd?.generationId?await api('job/'+cmd.generationId):await api('generate',req);events.push({kind:'generation',id:job.id,request:req,time:performance.now()});
  while(job.status==='working'&&(!job.previewUrl||variant==='smile')){if(token!==run||epoch!==generationEpoch){l.win.remove();return false;}const elapsed=Math.floor((performance.now()-startedAt)/1000);if(elapsed>180)throw Error('Sequence is taking too long. Please try again.');commandStatus.job(feedback,jobKey,describe(job.providerStatus==='IN_QUEUE'?'Queued for video':job.stage||'Rendering'));l.content.querySelector('.loading-label')!.textContent=job.stage+' · '+elapsed+' sec';if(job.image&&!l.content.querySelector('img')){const img=document.createElement('img');img.src=job.image;img.style.cssText='position:absolute;right:12px;top:5px;width:45px;height:70px;object-fit:contain';l.content.append(img);}await delay(120);job=await api('job/'+job.id);}
  if(token!==run||epoch!==generationEpoch){l.win.remove();return false;}if(job.status==='error')throw Error(job.error);l.win.remove();liveAssets[key]={url:job.previewUrl||job.url,image:job.image,playbackRate:cmd?.playbackRate};
  if(variant==='hat')liveAssets[`${profile}:tayne:hat`]=liveAssets[key];
  events.push({kind:'generated-ready',url:job.url,previewUrl:job.previewUrl,id:job.id,playbackRate:cmd?.playbackRate||1,timings:job.timings,time:performance.now(),elapsedMs:performance.now()-startedAt,character,variant});return true;
 }catch(e){l.win.remove();if(token===run&&epoch===generationEpoch){commandStatus.error(feedback,(e as Error).message);notify((e as Error).message);}events.push({kind:'generation-error',message:String(e)});return false;}finally{commandStatus.jobDone(feedback,jobKey);}
}
async function customDance(cmd:Command){const term=terminal();term.classList.add('custom-terminal');void type(cmd.response);const epoch=++generationEpoch;const character=cmd.label||'custom';context.character=character;context.costume=cmd.costume;if(await prepareDance(character,'base',epoch,cmd)){context.character=character;context.costume=cmd.costume;dancer(character,{title:cmd.label||'NEW SEQUENCE',className:'custom-dancer',x:520,y:12,w:282,h:502});musicFor(character);}}
async function dispatch(text:string,source='keyboard',feedback?:number){
 if(!text.trim())return;const token=run,order=++commandEpoch;void unlockAudio();
 const status=feedback??commandStatus.begin('Interpreting…',text,source==='microphone'?'Heard':'Command');feedbackToken=status;
 events.push({kind:'input',text,source,time:performance.now()});
 try{
  const known=scripted(text,context);let acknowledged=false;
  commandStatus.phase(status,known?'Running command':'Interpreting command');
  if(!known){acknowledged=true;void speak({action:'custom',response:'Okay.',audio:'okay'});void type('Computing sequence...');}
  const cmd=known||await api('command',{text,context,profile});
  if(token!==run||order!==commandEpoch||!commandStatus.current(status))return;
  if(!known){typing++;const content=desktop.querySelector('[data-id="terminal"] .content');if(content)content.textContent=cmd.response||'Command complete.';}
  context.history.push(text);context.history=context.history.slice(-12);
  commandStatus.phase(status,'Preparing sequence');await apply(cmd,acknowledged&&cmd.action==='custom');if(token===run&&order===commandEpoch){scriptGuide.observe(text,cmd.action);commandStatus.finish(status);}events.push({kind:'command-complete',text,action:cmd.action,time:performance.now()});return cmd;
 }catch(e){if(token===run&&order===commandEpoch&&commandStatus.current(status)){const message=(e as Error).name==='TimeoutError'?'Computer timed out. Please try again.':(e as Error).message;commandStatus.error(status,message);typing++;const content=desktop.querySelector('[data-id="terminal"] .content');if(content)content.textContent='Command failed.';}throw e;}
}
async function receiveAudio(base64:string,mime='audio/webm',feedback?:number,recording?:{requestId:string;durationMs:number;peak:number;device:string}){
 if(feedback!==undefined&&!commandStatus.current(feedback))return;
 const token=run,status=feedback??commandStatus.begin('Transcribing…');feedbackToken=status;
 const requestId=recording?.requestId||crypto.randomUUID(),startedAt=performance.now();
 const capture=recording?`Mic #${recording.requestId.split('-').pop()} · ${(recording.durationMs/1000).toFixed(1)}s captured`:'';
 commandStatus.phase(status,`Transcribing${capture?' · '+capture:''}`);
 try{
  const result=await api('transcribe',{audio:base64,mime,requestId});if(token!==run||!commandStatus.current(status))return;
  if(result.requestId!==requestId)throw Error('Transcript did not match this recording. Please try again.');
  const text=String(result.text||'').trim();events.push({kind:'transcription',text,requestId,recording,model:result.model,elapsedMs:performance.now()-startedAt});input.value=text;
  if(!text){commandStatus.error(status,'No speech heard. F1 → Replay mic to check the recording.');return;}
  commandStatus.echo(status,text);commandStatus.detail(status,`${capture||'Audio file'} · transcription ${(result.transcriptionMs/1000).toFixed(1)}s${recording?' · '+recording.device:''}`);
  return dispatch(text,'microphone',status);
 }catch(e){if(token===run&&commandStatus.current(status))commandStatus.error(status,(e as Error).name==='TimeoutError'?'Transcription timed out. F1 → Replay mic to check the recording.':(e as Error).message);throw e;}
}

function reset(){commandStatus.clear();scriptGuide.reset();run++;generationEpoch++;commandEpoch++;musicEpoch++;stopSpeech();recordingRequested=false;clearTimeout(stopRecordingTimer);if(recorder?.state==='recording')recorder.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;duckForMicrophone(false);clearTimers();typing++;music?.stop();music=null;ducks.clear();context={identity,character:'celery',pending:'',history:[]};desktop.classList.remove('alarm','paused','flash');clearWindows();started=false;replaying=false;paused=false;launch();}
async function begin(){scriptGuide.reset();void unlockAudio();void api('warm',{profile,name:identity}).catch(()=>{});clearWindows();started=true;dock.classList.add('hidden');await dispatch('Good morning','boot');}
function launch(){const t=windowBox({title:'Cinco Identity Generator 2.5',x:250,y:93,w:460,h:397,className:'launch'});t.content.innerHTML=`<h1>Your first sequence of the day.</h1><p>Choose an identity. Speak to your computer,<br>or type a command. It has important work to do.</p><label>Identity <select aria-label="Identity"><option value="paul">Paul Rudd</option><option value="thomas">Thomas Dimson</option><option value="upload">Use my photograph…</option></select></label><label>Your name <input aria-label="Your name" maxlength="35"></label><label>Experience <select aria-label="Experience"><option value="live">Live generation</option><option value="reference">Reference comparison</option></select></label><div class="buttons"><button class="classic-button start">Start computer</button><button class="classic-button replay">Play sketch</button></div><div class="note">F1 for controls · Space to talk · Private local session</div>`;
 const micMount=document.createElement('div');t.content.querySelector('.buttons')!.before(micMount);microphone.mount(micMount);
 const select=t.content.querySelector<HTMLSelectElement>('[aria-label="Identity"]')!,name=t.content.querySelector('input')!;select.value=['paul','thomas'].includes(profile)?profile:'upload';name.value=identity;
 let warmTimer:number;const warm=()=>{clearTimeout(warmTimer);warmTimer=window.setTimeout(()=>void api('warm',{profile,name:name.value.trim()}).catch(()=>{}),500);};name.addEventListener('input',warm);warm();
 select.onchange=async()=>{if(select.value==='upload'){const f=document.createElement('input');f.type='file';f.accept='image/*';f.onchange=async()=>{const file=f.files?.[0];if(!file)return;const b64=await fileBase64(file);const r=await api('profile',{image:b64});profile=r.id;name.value='';notify('Identity loaded. Enter your name.');};f.click();}else{profile=select.value;name.value=profile==='paul'?'Paul':'Thomas';warm();}};
 const save=()=>{mode=(t.content.querySelector('[aria-label="Experience"]') as HTMLSelectElement).value as 'live'|'reference';identity=name.value.trim()||'User';context.identity=identity;localStorage.setItem('cinco-profile',profile);localStorage.setItem('cinco-name',identity);};
 t.content.querySelector('.start')!.addEventListener('click',()=>{save();void begin();});t.content.querySelector('.replay')!.addEventListener('click',()=>{save();void replay();});}
async function replay(){scriptGuide.reset();void unlockAudio();run++;const token=run;clearTimers();clearWindows();stopSpeech();musicEpoch++;music?.stop();music=null;ducks.clear();context={identity,character:'celery',pending:'',history:[]};started=true;replaying=true;dock.classList.add('hidden');let origin=performance.now();for(const step of sketch){await delay(Math.max(0,step.at*1000-(performance.now()-origin)));if(token!==run)return;if('keyboard'in step){const a=new Audio('/media/original/keyboard.wav');routeAudio(a);if(sound)void a.play();}const before=performance.now();await dispatch(step.text,'sketch');if(mode==='live'&&performance.now()-before>250)origin+=performance.now()-before;}replaying=false;}
async function fileBase64(blob:Blob){return new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=reject;r.readAsDataURL(blob);});}
async function startRecording(){
 recordingRequested=true;clearTimeout(stopRecordingTimer);
 if(recordingStarting||recorder?.state==='recording')return;
 recordingStarting=true;
 // A new utterance supersedes pending interpretation, generation, and delayed windows.
 commandEpoch++;generationEpoch++;typing++;stopSpeech();lastMicPlayback?.pause();duckForMicrophone(true);
 const recordingRun=run,status=commandStatus.begin('Opening microphone · wait to speak');feedbackToken=status;
 const number=++recordingNumber,requestId=`${crypto.randomUUID()}-${number}`;
 try{
  stream=await microphone.open(stream);
  if(!recordingRequested||recordingRun!==run||!commandStatus.current(status)){stream.getTracks().forEach(t=>t.enabled=false);duckForMicrophone(false);commandStatus.error(status,'Microphone was not ready. Hold Space again and wait for Listening.');return;}
  stream.getTracks().forEach(t=>t.enabled=true);
  commandStatus.detail(status,`Input: ${stream.getAudioTracks()[0]?.label||microphone.label}`);
  const activeStream=stream,chunks:Blob[]=[],mime=MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/mp4';
  const current=new MediaRecorder(activeStream,{mimeType:mime});recorder=current;
  const audioContext=speechBus().context,source=audioContext.createMediaStreamSource(activeStream),meter=audioContext.createAnalyser();meter.fftSize=2048;source.connect(meter);
  const samples=new Float32Array(meter.fftSize);let peak=0;const began=performance.now();
  const interval=window.setInterval(()=>{meter.getFloatTimeDomainData(samples);const rms=Math.sqrt(samples.reduce((sum,v)=>sum+v*v,0)/samples.length);peak=Math.max(peak,rms);commandStatus.phase(status,`Listening #${number} · ${rms>.005?'signal OK':'quiet'} · release Space to send`);},100);
  current.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  current.onerror=()=>{commandStatus.error(status,'Microphone recording failed. Try again.');stopRecording();};
  current.onstop=async()=>{
   clearInterval(interval);source.disconnect();meter.disconnect();
   if(recorder===current){activeStream.getTracks().forEach(t=>t.enabled=false);duckForMicrophone(false);document.querySelector('.lamp')!.classList.remove('on');dock.querySelector('.mic')!.textContent='Microphone';}
   if(recordingRun!==run||!commandStatus.current(status))return;
   const blob=new Blob(chunks,{type:mime}),durationMs=performance.now()-began,device=activeStream.getAudioTracks()[0]?.label||'Default microphone';
   if(lastMicUrl)URL.revokeObjectURL(lastMicUrl);lastMicUrl=URL.createObjectURL(blob);
   const replay=dock.querySelector<HTMLButtonElement>('.replay-mic')!;replay.disabled=false;replay.title=`Replay mic #${number}: ${(durationMs/1000).toFixed(1)} seconds from ${device}`;
   commandStatus.echo(status,`${(durationMs/1000).toFixed(1)}s · F1 → Replay mic`,'Captured');
   events.push({kind:'microphone-capture',requestId,durationMs,peak,bytes:blob.size,device});
   if(durationMs<250||peak<.001){commandStatus.error(status,'Recording too short or quiet. F1 → Replay mic to check.');return;}
   try{await receiveAudio(await fileBase64(blob),mime,status,{requestId,durationMs,peak,device});}catch(e){notify((e as Error).message);}
  };
  current.start();commandStatus.phase(status,`Listening #${number} · speak now`);document.querySelector('.lamp')!.classList.add('on');dock.querySelector('.mic')!.textContent='Stop recording';
 }catch(e){duckForMicrophone(false);commandStatus.error(status,(e as Error).message||`Microphone unavailable: ${microphone.label}. Open F1 → Input device to select a connected microphone.`);notify('Check the microphone selection in F1 → Input device.');}
 finally{recordingStarting=false;}
}
function stopRecording(){recordingRequested=false;const current=recorder;clearTimeout(stopRecordingTimer);if(current?.state==='recording')stopRecordingTimer=window.setTimeout(()=>{if(current.state==='recording')current.stop();},150);}
dock.querySelector('.replay-mic')!.addEventListener('click',()=>{if(!lastMicUrl||recorder?.state==='recording')return;stopSpeech();lastMicPlayback?.pause();lastMicPlayback=new Audio(lastMicUrl);routeAudio(lastMicPlayback);void lastMicPlayback.play();});
dock.onsubmit=e=>{e.preventDefault();void unlockAudio();const text=input.value;input.value='';void dispatch(text).catch(e=>notify(e.message));};dock.querySelector('.mic')!.addEventListener('click',()=>recorder?.state==='recording'?stopRecording():void startRecording());
document.querySelector('.hint')!.addEventListener('click',()=>{dock.classList.toggle('hidden');input.focus();});
dock.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(b=>b.onclick=()=>{switch(b.dataset.tool){case'input':{const t=windowBox({title:'Microphone input',x:250,y:180,w:460,h:190,className:'input-settings'});microphone.mount(t.content);break;}case'identity':launch();break;case'printout':showPrintout();break;case'replay':void replay();break;case'reset':reset();break;case'hide':dock.classList.add('hidden');break;case'pause':void dispatch(paused?'resume':'pause');break;case'sound':sound=!sound;b.textContent=sound?'Sound on':'Sound off';if(!sound)stopSpeech();musicLevel();desktop.querySelectorAll<HTMLVideoElement>('video.intro-video').forEach(v=>v.muted=!sound);break;}});
addEventListener('keydown',e=>{if(e.key==='F1'||e.key==='Escape'){e.preventDefault();dock.classList.toggle('hidden');if(!dock.classList.contains('hidden'))input.focus();}if(e.code==='Space'&&!(e.target instanceof HTMLInputElement)&&!(e.target instanceof HTMLSelectElement)&&!e.repeat&&started){e.preventDefault();pushToTalk=true;void startRecording();}if(e.key==='Enter'&&!(e.target instanceof HTMLInputElement)&&started){dock.classList.remove('hidden');input.focus();}});
addEventListener('keyup',e=>{if(e.code==='Space'&&pushToTalk){pushToTalk=false;stopRecording();}});
addEventListener('pagehide',()=>{stream?.getTracks().forEach(t=>t.stop());});
addEventListener('blur',()=>{if(pushToTalk){pushToTalk=false;stopRecording();}});
Object.assign(window,{cinco:{playInputAudio:(src:string)=>{const a=new Audio(src);routeAudio(a);void a.play();},startOutputCapture,stopOutputCapture,dispatch,receiveAudio,apply,events,reset,replay,state:()=>({music:music?.state(),ducks:[...ducks],mode,liveAssets,profile,context,lastPrint,started,replaying,paused,windows:desktop.querySelectorAll('.window').length}),setIdentity:(id:string,name:string)=>{profile=id;identity=name;context.identity=name;},setMode:(v:'live'|'reference')=>{mode=v;},setSound:(v:boolean)=>{sound=v;if(!sound)stopSpeech();musicLevel();},settle:()=>delay(1800)}});
launch();
for(const name of ['okay','yes','greeting','hat','flower']){const audio=new Audio(`/media/original/${name}.wav`);audio.preload='auto';audio.load();}
