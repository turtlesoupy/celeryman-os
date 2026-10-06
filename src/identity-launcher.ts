import {bitmapPortrait,fillPortraitIcon} from './portrait-icon';
import {safeStorage} from './storage';

type Identity={id:string;name:string;label:string;thumbnail?:string};
type DesktopWindow={win:HTMLElement;content:HTMLElement};
type LauncherOptions={
 profile:string;name:string;compact:boolean;
 windowBox:(options:{title:string;x:number;y:number;w:number;h:number;className:string})=>DesktopWindow;
 removeWindow:(win:Element)=>void;
 upload:(image:string)=>Promise<{id:string}>;
 select:(identity:Identity)=>void;
 doubleClick:()=>void;
 start:(identity:Identity,win:HTMLElement,feedback:Promise<void>)=>Promise<void>;
};

// Small, hard-edged drawings use the same palette as Program Manager icons.
function icon(kind:string){
 const drawing=kind==='upload'
  ? '<path fill="#000" d="M3 10h11l3 3h13v17H3z"/><path fill="#ffff55" d="M4 11h9l3 3h13v15H4z"/><path fill="#aa5500" d="M5 17h24v12H5z"/><path fill="#ffff55" d="M7 18h24l-4 10H4z"/><path fill="#000" d="M18 2h4v5h4v3h-4v6h-4v-6h-4V7h4z"/><path fill="#55ffff" d="M19 3h2v5h4v1h-4v6h-2V9h-4V8h4z"/>'
  : `<path fill="#000" d="M11 2h10v2h3v4h2v11h-4v4h5v3h3v5H2v-5h3v-3h5v-4H6V8h2V4h3z"/><path fill="${kind==='thomas'?'#aa5500':'#553322'}" d="M11 3h10v2h2v5H8V8h1V5h2z"/><path fill="#ffcc99" d="M9 10h14v8h-3v4h-8v-4H9z"/><path fill="#fff" d="M11 22h10v3h-3v5h-4v-5h-3z"/><path fill="${kind==='thomas'?'#008888':kind==='custom'?'#aa00aa':'#0000aa'}" d="M6 24h5v3h3v3H3v-3h3zm15 0h5v3h3v3H18v-3h3z"/><path fill="#aa5500" d="M14 18h5v1h-5z"/>${kind==='thomas'?'<path fill="#000" d="M8 11h7v1h2v-1h7v5h-7v-3h-2v3H8z"/><path fill="#fff" d="M9 12h5v3H9zm9 0h5v3h-5z"/>':'<path fill="#000" d="M11 12h2v2h-2zm8 0h2v2h-2z"/>'}`;
 if(kind==='upload')return `<svg viewBox="0 0 32 32" aria-hidden="true" shape-rendering="crispEdges">${drawing}</svg>`;
 // A folded document gives each portrait the silhouette of a Windows bitmap file.
 return `<svg viewBox="0 0 40 40" aria-hidden="true" shape-rendering="crispEdges"><path fill="#808080" d="M8 3h20l8 8v29H8z"/><path fill="#000" d="M5 0h21l9 9v29H5z"/><path fill="#fff" d="M6 1h19v9h9v27H6z"/><g transform="translate(8 11) scale(.75)">${drawing}</g><path fill="#c0c0c0" d="M26 2v7h7z"/><path fill="#808080" d="M25 1h1v8h8v1h-9z"/></svg>`;
}

export function launchIdentity(options:LauncherOptions){
 const {windowBox,removeWindow}=options;
 const presets:Identity[]=[{id:'paul',name:'Paul',label:'Paul Rudd'},{id:'thomas',name:'Thomas',label:'Thomas Dimson'}];
 let custom:Identity|undefined;
 try{const saved=JSON.parse(safeStorage.getItem('cinco-custom-identity')||'null');if(saved?.id&&saved?.name)custom={id:String(saved.id),name:String(saved.name),label:String(saved.name),thumbnail:typeof saved.thumbnail==='string'?saved.thumbnail:undefined};}catch{}
 if(!presets.some(p=>p.id===options.profile)&&options.name.trim())custom={id:options.profile,name:options.name,label:options.name,thumbnail:custom?.id===options.profile?custom.thumbnail:undefined};
 let selected=presets.find(p=>p.id===options.profile)||custom||presets[0];
 const t=windowBox({title:'Cinco Identity Generator 2.5',x:230,y:155,w:500,h:230,className:'launch'});
 t.content.innerHTML='<fieldset class="identity-group"><legend>Identity</legend><div class="identity-icons" role="group" aria-label="Identity"></div></fieldset><div class="buttons"><button type="button" class="classic-button start">Start</button></div><p class="launch-status" role="status"></p>';
 const icons=t.content.querySelector<HTMLElement>('.identity-icons')!,start=t.content.querySelector<HTMLButtonElement>('.start')!,status=t.content.querySelector<HTMLElement>('.launch-status')!;
 let uploadWindow:DesktopWindow|undefined,starting=false;
 const render=()=>{
  icons.replaceChildren();
  for(const person of [...presets,...(custom?[custom]:[])]){
   const button=document.createElement('button');button.type='button';button.className='identity-icon';button.setAttribute('aria-pressed',String(person.id===selected.id));
   button.innerHTML=icon(presets.includes(person)?person.id:'custom');const label=document.createElement('span');label.textContent=person.label;button.append(label);
   void fillPortraitIcon(button,person.id,person.thumbnail);
   button.onclick=event=>{
    selected=person;
    // Keep the button mounted so the second click can produce a native dblclick.
    icons.querySelectorAll<HTMLButtonElement>('[aria-pressed]').forEach(other=>other.setAttribute('aria-pressed',String(other===button)));
    options.select(selected);button.focus();
    // Touch has no comfortable double-tap, so a single tap opens the identity on mobile.
    if(options.compact||(event as PointerEvent).pointerType==='touch')void startSelected(true);
   };
   button.ondblclick=()=>void startSelected(true);icons.append(button);
  }
  const upload=document.createElement('button');upload.type='button';upload.className='identity-icon';upload.innerHTML=icon('upload')+'<span>Upload</span>';upload.onclick=openUpload;icons.append(upload);
 };
 const sync=()=>{start.disabled=starting||!!uploadWindow;icons.querySelectorAll('button').forEach(b=>b.disabled=starting);};
 function openUpload(){
  if(uploadWindow){uploadWindow.win.classList.remove('minimized');uploadWindow.win.dispatchEvent(new Event('pointerdown'));uploadWindow.content.querySelector('input')?.focus();return;}
  uploadWindow=createUploadWindow(options,person=>{custom=selected=person;safeStorage.setItem('cinco-custom-identity',JSON.stringify(person));render();options.select(person);},()=>{uploadWindow=undefined;sync();icons.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();});sync();
 }
 t.win.addEventListener('windowclose',()=>{if(uploadWindow)removeWindow(uploadWindow.win);});
 async function startSelected(doubleClick=false){
  if(starting||uploadWindow)return;starting=true;sync();status.textContent='';
  let feedback=Promise.resolve();
  if(doubleClick){
   t.win.classList.add('identity-opening');options.doubleClick();
   feedback=new Promise(resolve=>setTimeout(resolve,180));
  }
  try{await options.start(selected,t.win,feedback);}catch(error){status.textContent=(error as Error).message;}
  finally{starting=false;t.win.classList.remove('identity-opening');sync();}
 }
 start.onclick=()=>void startSelected();
 render();options.select(selected);return t;
}

function createUploadWindow(options:LauncherOptions,saved:(identity:Identity)=>void,closed:()=>void){
 const t=options.windowBox({title:'New identity',x:270,y:55,w:420,h:440,className:'identity-upload'});
 t.win.setAttribute('role','dialog');
 t.content.innerHTML=`<p>Choose a clear photo of yourself.</p><div class="photo-stage"><span class="photo-placeholder">${icon('custom')}</span><img class="identity-preview hidden" alt="Your selected identity photo"><video class="camera-source" autoplay playsinline muted></video><canvas class="camera-preview hidden" aria-label="Live camera preview"></canvas></div><div class="photo-actions"><button type="button" class="classic-button choose-photo">Choose photo…</button><button type="button" class="classic-button use-camera">Use camera</button><button type="button" class="classic-button take-photo hidden" disabled>Take photo</button></div><input class="photo-file hidden" type="file" accept="image/*" aria-label="Upload identity photo"><label class="identity-name">Your name <input aria-label="Your name" maxlength="35" required autocomplete="given-name"></label><p class="photo-status" role="status">Add a photo and a name to save your identity.</p><div class="buttons"><button type="button" class="classic-button save-identity" disabled>Save</button><button type="button" class="classic-button cancel-identity">Cancel</button></div>`;
 const name=t.content.querySelector<HTMLInputElement>('[aria-label="Your name"]')!,file=t.content.querySelector<HTMLInputElement>('.photo-file')!,preview=t.content.querySelector<HTMLImageElement>('.identity-preview')!,video=t.content.querySelector<HTMLVideoElement>('video')!,live=t.content.querySelector<HTMLCanvasElement>('.camera-preview')!,placeholder=t.content.querySelector<HTMLElement>('.photo-placeholder')!;
 const status=t.content.querySelector<HTMLElement>('.photo-status')!,save=t.content.querySelector<HTMLButtonElement>('.save-identity')!,camera=t.content.querySelector<HTMLButtonElement>('.use-camera')!,capture=t.content.querySelector<HTMLButtonElement>('.take-photo')!,choose=t.content.querySelector<HTMLButtonElement>('.choose-photo')!;
 let image='',thumbnail='',cameraStream:MediaStream|undefined,epoch=0,busy=false,frame=0;
 const sync=()=>{save.disabled=busy||!image||!name.value.trim();choose.disabled=camera.disabled=name.disabled=busy;};
 const stopCamera=()=>{cancelAnimationFrame(frame);cameraStream?.getTracks().forEach(track=>track.stop());cameraStream=undefined;video.srcObject=null;live.classList.add('hidden');capture.classList.add('hidden');capture.disabled=true;camera.textContent='Use camera';preview.classList.toggle('hidden',!image);placeholder.classList.toggle('hidden',!!image);};
 const cleanup=()=>{epoch++;stopCamera();removeEventListener('pagehide',stopCamera);closed();};
 t.win.addEventListener('windowclose',cleanup,{once:true});addEventListener('pagehide',stopCamera);
 // iOS Safari sizes a mirrored camera <video> layer wrongly (a thin sliver), so the
 // hidden video only feeds frames and the mirrored preview is painted here.
 function paintPreview(){
  if(!cameraStream)return;
  const ratio=devicePixelRatio||1,width=Math.round(live.clientWidth*ratio),height=Math.round(live.clientHeight*ratio);
  if(width&&height&&video.videoWidth&&video.videoHeight){
   if(live.width!==width||live.height!==height){live.width=width;live.height=height;}
   const context=live.getContext('2d')!,scale=Math.min(width/video.videoWidth,height/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale;
   context.setTransform(-1,0,0,1,width,0);context.clearRect(0,0,width,height);context.drawImage(video,(width-w)/2,(height-h)/2,w,h);
  }
  frame=requestAnimationFrame(paintPreview);
 }
 function setPhoto(source:CanvasImageSource,width:number,height:number,mirror=false){
  const canvas=document.createElement('canvas'),scale=Math.min(1,1600/Math.max(width,height));canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);
  const context=canvas.getContext('2d')!;context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
  // Camera pixels must match the mirrored live preview, including the saved file.
  if(mirror){context.translate(canvas.width,0);context.scale(-1,1);}
  context.drawImage(source,0,0,canvas.width,canvas.height);
  image=canvas.toDataURL('image/jpeg',.9);thumbnail=bitmapPortrait(canvas,canvas.width,canvas.height);preview.src=image;stopCamera();status.textContent='Photo ready. Add your name, then save.';sync();
 }
 name.oninput=sync;choose.onclick=()=>file.click();
 file.onchange=async()=>{
  const photo=file.files?.[0];file.value='';if(!photo)return;const current=++epoch;stopCamera();busy=true;sync();status.textContent='Opening photo…';
  let url='';
  try{if(!photo.type.startsWith('image/'))throw Error('Choose an image file.');url=URL.createObjectURL(photo);const img=new Image();img.src=url;await img.decode();if(current!==epoch||!t.win.isConnected)return;setPhoto(img,img.naturalWidth,img.naturalHeight);}
  catch{if(current===epoch)status.textContent='Could not open that photo. Try a JPEG or PNG image.';}
  finally{if(url)URL.revokeObjectURL(url);if(current===epoch){busy=false;sync();}}
 };
 camera.onclick=async()=>{
  if(cameraStream){epoch++;stopCamera();status.textContent='Camera stopped. Choose a photo or try again.';return;}
  const current=++epoch;camera.disabled=true;status.textContent='Allow camera access to take a photo.';
  try{
   const opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});
   if(current!==epoch||!t.win.isConnected){opened.getTracks().forEach(track=>track.stop());return;}
   cameraStream=opened;video.srcObject=opened;live.classList.remove('hidden');preview.classList.add('hidden');placeholder.classList.add('hidden');capture.classList.remove('hidden');camera.textContent='Stop camera';
   await video.play();if(current!==epoch||!t.win.isConnected)return;paintPreview();capture.disabled=false;status.textContent='Ready when you are. Take a photo.';
  }catch{if(current===epoch){stopCamera();status.textContent='Camera unavailable. Allow camera access or choose a photo instead.';}}
  finally{if(current===epoch)sync();}
 };
 capture.onclick=()=>{if(video.videoWidth&&video.videoHeight){epoch++;setPhoto(video,video.videoWidth,video.videoHeight,true);}};
 save.onclick=async()=>{
  const identityName=name.value.trim();if(busy||!image||!identityName)return;const current=++epoch;stopCamera();busy=true;sync();status.textContent='Saving identity…';
  try{const result=await options.upload(image.split(',')[1]);if(current!==epoch||!t.win.isConnected)return;saved({id:result.id,name:identityName,label:identityName,thumbnail});options.removeWindow(t.win);}
  catch(error){if(current===epoch)status.textContent='Could not save: '+(error as Error).message;}
  finally{if(current===epoch){busy=false;sync();}}
 };
 t.content.querySelector('.cancel-identity')!.addEventListener('click',()=>options.removeWindow(t.win));
 t.win.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();options.removeWindow(t.win);}});
 choose.focus();return t;
}
