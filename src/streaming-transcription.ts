type TranscriptEvent = {type:string;item_id?:string;delta?:string;transcript?:string;error?:{message?:string}};
export type StreamingTranscript = {text:string;model:string;transcriptionMs:number;firstPartialMs?:number};

class Connection {
  socket?:WebSocket;
  closed=false;
  onEvent?:(event:TranscriptEvent)=>void;
  onFailure?:(error:Error)=>void;
  private controller=new AbortController();
  private timer?:ReturnType<typeof setTimeout>;
  private rejectReady!:(error:Error)=>void;
  readonly ready:Promise<void>;
  constructor(){
    this.ready=new Promise<void>((resolve,reject)=>{
      this.rejectReady=reject;
      this.timer=setTimeout(()=>this.fail(Error('Streaming connection timed out')),6000);
      void (async()=>{
        const response=await fetch('/api/transcribe/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:this.controller.signal});
        if(!response.ok)throw Error(`Streaming transcription unavailable (${response.status})`);
        const secret=await response.json();
        if(this.closed)return;
        const socket=this.socket=new WebSocket('wss://api.openai.com/v1/realtime?intent=transcription',['realtime','openai-insecure-api-key.'+secret.value]);
        socket.onmessage=({data})=>{
          try{
            const event=JSON.parse(data) as TranscriptEvent;
            if(event.type==='session.created'){clearTimeout(this.timer);resolve();}
            else if(event.type==='error')this.fail(Error(event.error?.message||'Streaming transcription failed'));
            else this.onEvent?.(event);
          }catch{this.fail(Error('Unreadable streaming transcription event'));}
        };
        socket.onerror=()=>this.fail(Error('Streaming connection failed'));
        socket.onclose=()=>{if(!this.closed)this.fail(Error('Streaming connection closed'));};
      })().catch(error=>this.fail(error instanceof Error?error:Error(String(error))));
    });
    void this.ready.catch(()=>{});
  }
  send(event:object){
    if(this.closed||this.socket?.readyState!==WebSocket.OPEN)throw Error('Streaming connection unavailable');
    if(this.socket.bufferedAmount>480000)throw Error('Streaming connection is too slow');
    this.socket.send(JSON.stringify(event));
  }
  private fail(error:Error){if(this.closed)return;this.close();this.onFailure?.(error);}
  close(){
    if(this.closed)return;
    this.closed=true;clearTimeout(this.timer);this.controller.abort();
    this.rejectReady(Error('Streaming connection closed'));
    this.socket?.close();
  }
}

let warm:Connection|undefined;
let idleTimer:ReturnType<typeof setTimeout>|undefined;
export function warmTranscription(){
  if(warm&&!warm.closed)return;
  warm=new Connection();
  clearTimeout(idleTimer);idleTimer=setTimeout(closeTranscription,45000);
}
export function closeTranscription(){clearTimeout(idleTimer);warm?.close();warm=undefined;}
const modules=new WeakMap<AudioContext,Promise<void>>();
export function prepareTranscription(context:AudioContext){
  let pending=modules.get(context);
  if(!pending){
    pending=context.audioWorklet.addModule(new URL('./transcription-worklet.js',import.meta.url).href);
    modules.set(context,pending);void pending.catch(()=>modules.delete(context));
  }
  return pending;
}

/** One connection per recording prevents late transcripts from crossing turns. */
export class TranscriptionTurn {
  private connection:Connection;
  private source:MediaStreamAudioSourceNode;
  private node:AudioWorkletNode;
  private silent:GainNode;
  private queue:ArrayBuffer[]=[];
  private queuedBytes=0;
  private connected=false;
  private settled=false;
  private started=performance.now();
  private committedAt=0;
  private itemId?:string;
  private partial='';
  private firstPartialMs?:number;
  private timer?:ReturnType<typeof setTimeout>;
  private flushed?:()=>void;
  private reject!:(error:Error)=>void;
  private resolve!:(result:StreamingTranscript)=>void;
  private result:Promise<StreamingTranscript>;
  constructor(context:AudioContext,stream:MediaStream,onPartial:(text:string)=>void){
    this.source=context.createMediaStreamSource(stream);
    this.node=new AudioWorkletNode(context,'transcription-capture');
    this.silent=context.createGain();this.silent.gain.value=0;
    clearTimeout(idleTimer);
    this.connection=warm&&!warm.closed?warm:new Connection();warm=undefined;
    this.result=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
    void this.result.catch(()=>{});
    this.node.onprocessorerror=()=>this.fail(Error('Microphone streaming capture failed'));
    this.node.port.onmessage=({data})=>{
      if(data==='flushed'){this.flushed?.();return;}
      if(this.settled)return;
      if(this.connected)this.append(data);
      else{
        this.queuedBytes+=data.byteLength;
        if(this.queuedBytes>480000){this.fail(Error('Streaming startup is too slow'));return;}
        this.queue.push(data);
      }
    };
    this.source.connect(this.node);this.node.connect(this.silent);this.silent.connect(context.destination);
    this.connection.onFailure=error=>this.fail(error);
    this.connection.onEvent=event=>{
      if(this.settled)return;
      if(event.type==='input_audio_buffer.committed')this.itemId=event.item_id;
      if(event.type==='conversation.item.input_audio_transcription.failed'){this.fail(Error(event.error?.message||'Streaming transcription failed'));return;}
      if(event.type==='conversation.item.input_audio_transcription.delta'){
        this.firstPartialMs??=performance.now()-this.started;
        this.partial+=event.delta||'';onPartial(this.partial);
      }
      if(event.type==='conversation.item.input_audio_transcription.completed'&&this.committedAt&&event.item_id===this.itemId){
        this.settled=true;
        this.resolve({text:event.transcript||'',model:'gpt-live-transcribe',transcriptionMs:performance.now()-this.committedAt,firstPartialMs:this.firstPartialMs});
        this.cleanup();
      }
    };
    void this.connection.ready.then(()=>{
      if(this.settled)return;
      this.connected=true;
      for(const bytes of this.queue)this.append(bytes);
      this.queue=[];this.queuedBytes=0;
    }).catch(error=>this.fail(error));
    this.timer=setTimeout(()=>this.fail(Error('Streaming recording exceeded two minutes')),120000);
  }
  private append(bytes:ArrayBuffer){
    try{
      const chars=String.fromCharCode(...new Uint8Array(bytes));
      this.connection.send({type:'input_audio_buffer.append',audio:btoa(chars)});
    }catch(error){this.fail(error as Error);}
  }
  async finish():Promise<StreamingTranscript>{
    if(this.settled)return this.result;
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>this.fail(Error('Streaming transcript timed out')),5000);
    try{
      await new Promise<void>(resolve=>{this.flushed=resolve;this.node.port.postMessage('flush');});
      this.source.disconnect();this.node.disconnect();this.silent.disconnect();
      await this.connection.ready;
      if(!this.settled){this.committedAt=performance.now();this.connection.send({type:'input_audio_buffer.commit'});}
    }catch(error){this.fail(error as Error);}
    return this.result;
  }
  cancel(){this.fail(new DOMException('Recording cancelled','AbortError'));}
  private fail(error:Error){if(this.settled)return;this.settled=true;this.reject(error);this.cleanup();}
  private cleanup(){
    clearTimeout(this.timer);this.flushed?.();
    this.source.disconnect();this.node.disconnect();this.node.port.close();this.silent.disconnect();
    this.queue=[];this.connection.close();
  }
}
