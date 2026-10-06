// One output bus makes audible playback and the benchmark recording identical.
let context:AudioContext|undefined;
let capture:MediaStreamAudioDestinationNode|undefined;
let output:GainNode|undefined;
const connected=new WeakSet<HTMLMediaElement>();
let recorder:MediaRecorder|undefined;
let chunks:Blob[]=[];
function bus(){
 context??=new AudioContext({latencyHint:'playback'});
 capture??=context.createMediaStreamDestination();
 if(context.state!=='running')void context.resume().catch(()=>{});
 if(!output){output=context.createGain();output.connect(context.destination);output.connect(capture);}
 return {context,capture,output};
}
export function speechBus(){return bus();}
// Keep the soundtrack audible during push-to-talk, with a smooth volume change.
export function duckForMicrophone(recording:boolean){
 const b=bus(),gain=b.output.gain,now=b.context.currentTime;
 gain.cancelScheduledValues(now);
 gain.setTargetAtTime(recording?.4:1,now,.025);
}
/** Safari 16.4+: settle the audio session for talking and listening up front, so
 * opening the microphone mid-session does not reconfigure (and interrupt) output. */
export function preparePlayAndRecord(){
 const session=(navigator as Navigator&{audioSession?:{type:string}}).audioSession;
 if(session&&session.type!=='play-and-record')session.type='play-and-record';
}
// iOS interrupts this context when the microphone opens and refuses resume()
// outside a tap. Every tap retries it, so a later reply is not silenced.
const blockedListeners=new Set<()=>void>();
for(const type of ['pointerdown','pointerup','touchend','keydown'])addEventListener(type,()=>{if(context&&context.state!=='running')void context.resume().catch(()=>{});},{capture:true,passive:true});
export function onAudioBlocked(listener:()=>void){blockedListeners.add(listener);return ()=>blockedListeners.delete(listener);}
/** Resolves once output is running; when the browser wants a tap first, waits for one. */
export async function unlockAudio(){
 const {context:ctx}=bus();
 try{await ctx.resume();}
 catch(error){
  if(!(error instanceof DOMException&&error.name==='NotAllowedError'))throw error;
  blockedListeners.forEach(listener=>listener());
 }
 if(ctx.state==='running')return;
 await new Promise<void>(resolve=>{const check=()=>{if(ctx.state!=='running')return;ctx.removeEventListener('statechange',check);resolve();};ctx.addEventListener('statechange',check);check();});
}
let desktopClick:AudioBuffer|undefined;
export function playDesktopDoubleClick(){
 try{
  const b=bus();
  if(!desktopClick){
   // Two short, slightly different plastic-switch clicks with a grainy 8-bit tail.
   const rate=22050;desktopClick=b.context.createBuffer(1,Math.ceil(rate*.16),rate);
   const samples=desktopClick.getChannelData(0);let seed=17;
   for(const [at,level] of [[0,1],[.085,.85]])for(let i=0;i<rate*.045;i++){
    const t=i/rate;seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const noise=(seed/4294967296)*2-1;
    const snap=noise*Math.exp(-t*260)+.45*Math.sin(2*Math.PI*1850*t)*Math.exp(-t*190)+.3*Math.sin(2*Math.PI*620*t)*Math.exp(-t*110);
    samples[Math.round(at*rate)+i]=Math.round(snap*level*24)/128;
   }
  }
  const source=b.context.createBufferSource();source.buffer=desktopClick;source.connect(b.output);
  source.onended=()=>source.disconnect();source.start();
 }catch{/* Sound feedback must never prevent opening an identity. */}
}
export function routeAudio(media:HTMLMediaElement){
 if(connected.has(media))return media;
 const b=bus();const source=b.context.createMediaElementSource(media);
 source.connect(b.output);connected.add(media);
 // A connected source keeps its element alive. Detach finished one-shot audio
 // so it can be collected, and reattach if the same element plays again.
 let linked=true;
 media.addEventListener('play',()=>{if(!linked){source.connect(b.output);linked=true;}});
 const detach=()=>{if(linked){source.disconnect();linked=false;}};
 for(const event of ['pause','ended','emptied'])media.addEventListener(event,detach);
 return media;
}
export function startOutputCapture(){
 const b=bus();chunks=[];recorder=new MediaRecorder(b.capture.stream,{mimeType:'audio/webm;codecs=opus'});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);
 return b.context.currentTime;
}
export async function stopOutputCapture(){
 if(!recorder||recorder.state!=='recording')throw Error('Output capture is not running');
 const current=recorder;await new Promise<void>(resolve=>{current.onstop=()=>resolve();current.stop();});
 const bytes=new Uint8Array(await new Blob(chunks,{type:current.mimeType}).arrayBuffer());
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);
}

// Decoded audio is large (about 2 MB per generated clip). Keep only recent tracks.
const buffers=new Map<string,Promise<AudioBuffer>>(),MAX_BUFFERS=24;
export function preloadAudio(url:string){
 let pending=buffers.get(url);
 if(pending){buffers.delete(url);buffers.set(url,pending);return pending;}
 pending=fetch(url).then(r=>{if(!r.ok)throw Error(`Audio unavailable: ${r.status}`);return r.arrayBuffer();}).then(bytes=>bus().context.decodeAudioData(bytes));buffers.set(url,pending);pending.catch(()=>buffers.delete(url));
 while(buffers.size>MAX_BUFFERS)buffers.delete(buffers.keys().next().value!);
 return pending;
}

// Decode once and loop on the audio clock, without an HTMLMediaElement seek.
// Generated scores often contain an outro: discard near-silent padding and blend
// the final 60 ms into the opening so the repeating bed has no fade-to-silence.
export function loopBuffer(input:AudioBuffer,generated:boolean){
 const ctx=bus().context,sr=input.sampleRate;let start=0,end=input.length;
 if(generated){
  const step=Math.round(sr*.02),data=input.getChannelData(0);
  const rms=(a:number,b:number)=>{let sum=0;for(let i=a;i<b;i++)sum+=data[i]*data[i];return Math.sqrt(sum/(b-a));};
  let peak=0;for(let i=0;i+step<end;i+=step)peak=Math.max(peak,rms(i,i+step));
  while(start<input.length*.2&&rms(start,start+step)<peak*.2)start+=step;
  while(end>input.length*.65&&rms(end-step,end)<peak*.2)end-=step;
 }
 const blend=Math.min(Math.round(sr*(generated?.06:.005)),Math.floor((end-start)/8));
 const output=ctx.createBuffer(input.numberOfChannels,end-start-blend,sr);
 for(let c=0;c<input.numberOfChannels;c++){
  const src=input.getChannelData(c),dst=output.getChannelData(c);dst.set(src.subarray(start+blend,end));
  for(let i=0;i<blend;i++){const t=(i+1)/blend;dst[dst.length-blend+i]=src[end-blend+i]*(1-t)+src[start+i]*t;}
 }
 return output;
}
/** One-shot clip on the shared output. Unlike a new <audio> element, a buffer
 * source needs no tap of its own on iOS once the context is running. */
export class Clip{
 private node?:AudioBufferSourceNode;
 private stopped=false;
 private finish!:()=>void;
 readonly done=new Promise<void>(resolve=>{this.finish=resolve;});
 constructor(readonly url:string){}
 async play(onStart?:()=>void){
  const buffer=await preloadAudio(this.url);if(this.stopped)return;
  await unlockAudio();if(this.stopped)return;
  const b=bus(),node=b.context.createBufferSource();node.buffer=buffer;node.connect(b.output);
  node.onended=()=>{node.disconnect();this.finish();};this.node=node;node.start();onStart?.();
 }
 stop(){this.stopped=true;try{this.node?.stop();}catch{/* Not started yet. */}this.node?.disconnect();this.finish();}
}
export class MusicLoop {
 private node?:AudioBufferSourceNode;
 private gain=bus().context.createGain();
 private buffer?:AudioBuffer;
 private offset=0;
 private began=0;
 private active=false;
 private disposed=false;
 private level=.6;
 readonly ready:Promise<void>;
 constructor(readonly url:string,generated=false){
  const b=bus();this.gain.connect(b.output);
  this.ready=preloadAudio(url).then(buffer=>{if(!this.disposed)this.buffer=loopBuffer(buffer,generated);});
 }
 get volume(){return this.level;}
 set volume(value:number){this.level=value;const ctx=bus().context;this.gain.gain.cancelScheduledValues(ctx.currentTime);this.gain.gain.setTargetAtTime(value,ctx.currentTime,.025);}
 async play(){this.active=true;await this.ready;if(this.disposed||!this.active||this.node||!this.buffer)return;
  const ctx=bus().context;this.node=ctx.createBufferSource();this.node.buffer=this.buffer;this.node.loop=true;this.node.connect(this.gain);this.began=ctx.currentTime;this.node.start(0,this.offset%this.buffer.duration);
 }
 pause(){this.active=false;if(!this.node)return;this.offset+=(bus().context.currentTime-this.began);this.node.stop();this.node.disconnect();this.node=undefined;}
 stop(){this.pause();this.disposed=true;this.gain.disconnect();}
 state(){return {url:this.url,playing:!!this.node,volume:this.level,duration:this.buffer?.duration,offset:this.offset};}
}
