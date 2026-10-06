import {withSession} from './session';
import {speechBus,unlockAudio} from './audio';
type Hooks={beforePlayback?:()=>Promise<void>;onStart:()=>void;onEnd:()=>void;onError:(error:Error)=>void;onComplete:(summary:Record<string,unknown>)=>void};
/** Schedule raw 24 kHz mono PCM on the same clock and capture bus as music. */
export class StreamingSpeech {
 private controller=new AbortController();
 private nodes=new Set<AudioBufferSourceNode>();
 private pending=new Uint8Array(0);
 private next=0;
 private scheduled=false;
 private finished=false;
 private stopped=false;
 private began=false;
 private startTimer?:number;
 private resolveStarted!:()=>void;
 private underruns=0;
 readonly started=new Promise<void>(resolve=>{this.resolveStarted=resolve;});
 constructor(text:string,private hooks:Hooks){void this.read(text);}
 stop(){if(this.stopped)return;this.stopped=true;this.controller.abort();clearTimeout(this.startTimer);for(const node of this.nodes){node.onended=null;node.stop();node.disconnect();}this.nodes.clear();this.resolveStarted();}
 private chunk(bytes:Uint8Array,final=false){
  const joined=new Uint8Array(this.pending.length+bytes.length);joined.set(this.pending);joined.set(bytes,this.pending.length);this.pending=joined;
  // Build a small runway before starting, rather than playing the first 100 ms
  // immediately and leaving gaps when the next provider packet arrives late.
  if(joined.length<(this.scheduled?4800:16800)&&!final)return;
  const count=Math.floor(joined.length/2);if(!count)return;
  const {context,output}=speechBus(),buffer=context.createBuffer(1,count,24000),out=buffer.getChannelData(0),view=new DataView(joined.buffer);
  for(let i=0;i<count;i++)out[i]=view.getInt16(i*2,true)/32768;
  this.pending=joined.slice(count*2);
  const late=this.scheduled&&this.next<context.currentTime;
  if(late)this.underruns++;
  const lead=Math.min(.5,Math.max(.18,context.baseLatency+(context.outputLatency||0)+.05));
  const start=this.scheduled&&!late?this.next:context.currentTime+lead;this.next=start+buffer.duration;this.scheduled=true;
  const source=context.createBufferSource();source.buffer=buffer;source.connect(output);this.nodes.add(source);
  source.onended=()=>{source.disconnect();this.nodes.delete(source);this.maybeEnd();};source.start(start);
  if(!this.began&&this.startTimer===undefined){
   // Do not duck the music during cloud latency or leading digital silence.
   for(let i=0;i<count;i+=240){let energy=0;const end=Math.min(count,i+240);for(let j=i;j<end;j++)energy+=out[j]*out[j];if(Math.sqrt(energy/(end-i))>.002){
    const onset=start+i/24000;
    const announce=()=>{if(this.stopped)return;const remaining=onset-context.currentTime;if(context.state!=='running'||remaining>0){this.startTimer=window.setTimeout(announce,Math.max(20,remaining*1000));return;}this.began=true;this.hooks.onStart();this.resolveStarted();};
    this.startTimer=window.setTimeout(announce,Math.max(0,(onset-context.currentTime)*1000));break;
   }}
  }
 }
 private maybeEnd(){if(this.finished&&!this.nodes.size&&!this.stopped){clearTimeout(this.startTimer);this.stopped=true;this.resolveStarted();this.hooks.onEnd();}}
 private async read(text:string){
  try{
   const response=await withSession(headers=>fetch('/api/voice/stream',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify({text}),signal:this.controller.signal}));
   // Proxies and the edge can answer with plain text or HTML, not JSON.
   if(!response.ok){const body=await response.text();let message:string|undefined;try{message=JSON.parse(body).error;}catch{}throw Error(message||`Voice unavailable (${response.status})`);}
   // Opening a Bluetooth input can change the output route. Fetch concurrently,
   // but keep all PCM queued until that setup finishes.
   await this.hooks.beforePlayback?.();if(this.stopped)return;
   // Do not advance the speech timeline while the output context is suspended.
   await unlockAudio();if(this.stopped)return;
   const reader=response.body?.getReader();if(!reader)throw Error('Missing voice stream');const decoder=new TextDecoder();let pending='',complete:Record<string,unknown>|undefined;
   while(true){const {value,done}=await reader.read();if(this.stopped)return;if(done)break;pending+=decoder.decode(value,{stream:true});let at:number;
    while((at=pending.indexOf('\n'))>=0){const line=pending.slice(0,at);pending=pending.slice(at+1);if(!line)continue;const event=JSON.parse(line);
     if(event.type==='error')throw Error(event.error||'Speech generation failed');
     if(event.type==='pcm')this.chunk(Uint8Array.from(atob(event.data),c=>c.charCodeAt(0)));
     if(event.type==='done')complete=event;
    }
   }
   if(this.stopped)return;if(!complete)throw Error('Speech stream ended early');this.chunk(new Uint8Array(),true);if(this.pending.length)throw Error('Incomplete speech sample');
   this.hooks.onComplete({...complete,underruns:this.underruns});this.finished=true;this.maybeEnd();
  }catch(e){if(this.stopped)return;this.stop();this.hooks.onError(e instanceof Error?e:Error(String(e)));}
 }
}
