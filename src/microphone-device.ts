import {safeStorage} from './storage';
type InputDevice=Pick<MediaDeviceInfo,'deviceId'|'groupId'|'label'>;
const physical=(device:InputDevice)=>device.deviceId&& !['default','communications'].includes(device.deviceId);
const cleanLabel=(label:string)=>label.replace(/^default\s*(?:[-–—:]\s*|\((.*)\)$)/i,'$1').trim().toLowerCase();
export function microphoneConstraints(deviceId:string):MediaTrackConstraints{
 return {echoCancellation:true,noiseSuppression:true,autoGainControl:true,...(deviceId?{deviceId:{exact:deviceId}}:{})};
}
export function resolveMicrophone(devices:InputDevice[],selected:string):InputDevice|undefined{
 if(selected!=='default')return devices.find(d=>d.deviceId===selected);
 const alias=devices.find(d=>d.deviceId==='default');
 if(!alias)return devices[0];
 const candidates=devices.filter(physical);
 const group=alias.groupId?candidates.filter(d=>d.groupId===alias.groupId):[];
 const named=alias.label?candidates.filter(d=>cleanLabel(d.label)===cleanLabel(alias.label)):[];
 return group.length===1?group[0]:named.length===1?named[0]:alias;
}
export function microphoneMatches(track:Pick<MediaStreamTrack,'label'|'getSettings'>,expected:InputDevice){
 const actual=track.getSettings();
 if(physical(expected)&&actual.deviceId&& !['default','communications'].includes(actual.deviceId))return actual.deviceId===expected.deviceId;
 if(expected.groupId&&actual.groupId&&expected.groupId!==actual.groupId)return false;
 return !!expected.label&&!!track.label&&cleanLabel(expected.label)===cleanLabel(track.label);
}
/** An explicit device stays selected even when unplugged; never silently use another mic. */
export class MicrophoneDevices{
 private selected:string;
 private savedLabel:string;
 private devices:MediaDeviceInfo[]=[];
 private views=new Set<HTMLElement>();
 private message='';
 private detecting=false;
 private verified='';
 private verifiedId='';
 private listeners=new Set<(label:string)=>void>();
 constructor(private changed:()=>void,private busy:()=>boolean,private media=navigator.mediaDevices,private storage:Pick<Storage,'getItem'|'setItem'>=safeStorage){this.selected=storage.getItem('cinco-microphone')||'default';this.savedLabel=storage.getItem('cinco-microphone-label')||'';media?.addEventListener('devicechange',()=>void this.refresh());}
 get constraints(){return microphoneConstraints(resolveMicrophone(this.devices,this.selected)?.deviceId||this.selected);}
 get label(){return this.devices.find(d=>d.deviceId===this.selected)?.label||this.savedLabel||(this.selected==='default'?'Default microphone':'Selected microphone');}
 subscribe(listener:(label:string)=>void){this.listeners.add(listener);listener(this.verified||resolveMicrophone(this.devices,this.selected)?.label||this.label);return ()=>this.listeners.delete(listener);}
 async open(existing?:MediaStream|null):Promise<MediaStream>{
  await this.refresh();
  let expected=resolveMicrophone(this.devices,this.selected);
  if(this.selected!=='default'&&!expected){existing?.getTracks().forEach(t=>t.stop());throw Error(`Selected microphone is disconnected: ${this.savedLabel||this.selected}. Use the gear to choose a connected microphone.`);}
  const cached=existing?.getAudioTracks().find(t=>t.readyState==='live');
  if(cached&&expected&&microphoneMatches(cached,expected))return existing!;
  existing?.getTracks().forEach(t=>t.stop());
  // Even the default alias is an exact constraint. Never delegate an unspecified choice.
  const selected=this.selected;
  const opened=await this.media.getUserMedia({audio:microphoneConstraints(expected?.deviceId||selected)});
  try{
   // First-time permission reveals device names. Keep that same stream open:
   // stopping and reopening it makes Bluetooth startup happen twice.
   if(!expected?.deviceId||!expected.label){await this.refresh();expected=resolveMicrophone(this.devices,selected);}
   const track=opened.getAudioTracks()[0];
   if(selected!==this.selected)throw Error('Microphone selection changed. Try again.');
   if(!track||!expected||!microphoneMatches(track,expected))throw Error(`Microphone mismatch: requested ${expected?.label||this.savedLabel||'default input'}, but the browser opened ${track?.label||'an unidentified input'}. Select your headphones by name. Recording was not started.`);
   this.verified=track.label;this.verifiedId=expected.deviceId;this.render();return opened;
  }catch(error){opened.getTracks().forEach(t=>t.stop());throw error;}
 }
 async refresh(){
  try{this.devices=(await this.media.enumerateDevices()).filter(d=>d.kind==='audioinput');this.message='';if(resolveMicrophone(this.devices,this.selected)?.deviceId!==this.verifiedId)this.verified='';}
  catch{this.message='Microphone devices unavailable. Check browser permission.';}
  this.render();
 }
 mount(parent:HTMLElement){
  const view=document.createElement('div');view.className='microphone-settings';
  view.innerHTML='<label>Microphone <select aria-label="Microphone input"></select></label><div class="microphone-actions"><button type="button" class="classic-button detect-microphones">Enable microphones</button><span class="microphone-note" role="status"></span></div>';
  parent.append(view);this.views.add(view);
  view.querySelector('select')!.onchange=()=>{
   if(this.busy()){this.message='Finish the recording before switching microphones.';this.render();return;}
   this.verified='';this.selected=view.querySelector('select')!.value;this.savedLabel=this.devices.find(d=>d.deviceId===this.selected)?.label||'';
   this.storage.setItem('cinco-microphone',this.selected);this.storage.setItem('cinco-microphone-label',this.savedLabel);this.message='';this.changed();this.render();
  };
  view.querySelector('button')!.onclick=async()=>{
   if(this.busy()){this.message='Finish the recording first.';this.render();return;}
   this.detecting=true;this.message='Checking selected microphone…';this.render();
   try{if(!this.devices.some(d=>d.label)){const permission=await this.media.getUserMedia({audio:true});permission.getTracks().forEach(t=>t.stop());await this.refresh();}const checked=await this.open();checked.getTracks().forEach(t=>t.stop());}
   catch(error){this.verified='';this.message=error instanceof Error?error.message:'Allow microphone access in your browser to choose an input.';}
   finally{this.detecting=false;this.render();}
  };
  this.render();void this.refresh();
 }
 private render(){
  for(const listener of this.listeners)listener(this.verified||resolveMicrophone(this.devices,this.selected)?.label||this.label);
  for(const view of this.views){
   if(!view.isConnected){this.views.delete(view);continue;}
   const select=view.querySelector('select')!;select.replaceChildren();
   const system=resolveMicrophone(this.devices,'default');select.add(new Option(system?.label?`Default input — ${system.label.replace(/^default\s*-?\s*/i,'')}`:'Default input (not verified)','default'));
   this.devices.filter(d=>d.deviceId&&d.deviceId!=='default').forEach((d,i)=>select.add(new Option(d.label||`Microphone ${i+1}`,d.deviceId)));
   const named=this.devices.some(d=>d.label),missing=this.selected!=='default'&&!this.devices.some(d=>d.deviceId===this.selected);
   if(missing)select.add(new Option(`${this.savedLabel||'Saved microphone'} — unavailable`,this.selected));
   select.value=this.selected;select.disabled=this.detecting;
   const note=view.querySelector<HTMLElement>('.microphone-note')!;
   note.textContent=this.message||(this.verified?`Verified input: ${this.verified}`:missing?'Reconnect this microphone or choose another.':!named?'Enable access to identify your headphones.':this.selected==='default'?'Test this input, or choose your headphones by name.':`Input: ${this.label}`);
   const button=view.querySelector('button')!;button.textContent=named?'Test input':'Enable microphones';button.disabled=this.detecting;
  }
 }
}
