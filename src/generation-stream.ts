import {requestJson} from './api-client';

export type JobState={id:string;status:string;stage?:string;providerStatus?:string;previewUrl?:string;url?:string;image?:string;error?:string;timings?:Record<string,number>};

// The server heartbeats every 10s; a silent stream for longer has been lost.
const IDLE_MS=30000,COMMAND_MS=45000,REJOIN_ATTEMPTS=2;
const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
const retryable=(error:unknown)=>['TypeError','TimeoutError','StreamEnded'].includes((error as Error)?.name);

/** POST, then read Server-Sent Events. A plain JSON reply arrives as one `json` event. */
async function postEvents(url:string,body:unknown,onEvent:(event:string,data:any)=>void,signal:AbortSignal){
 const controller=new AbortController(),abort=()=>controller.abort(signal.reason);
 if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
 let timer=0;const idle=()=>{clearTimeout(timer);timer=window.setTimeout(()=>controller.abort(new DOMException('The connection went quiet','TimeoutError')),IDLE_MS);};
 idle();
 try{
  const response=await fetch('/api/'+url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify(body),signal:controller.signal});
  if(!(response.headers.get('content-type')||'').includes('text/event-stream')){
   const text=await response.text();let data:any;try{data=JSON.parse(text);}catch{}
   if(!response.ok)throw Error(data?.error||`Server request failed (HTTP ${response.status}). Please retry the command.`);
   if(data===undefined)throw Error('The server returned an unreadable response. Please retry the command.');
   onEvent('json',data);return;
  }
  const reader=response.body!.pipeThrough(new TextDecoderStream()).getReader();let buffer='';
  for(;;){
   const {value,done}=await reader.read();if(done)return;
   idle();buffer+=value;
   for(let split=buffer.indexOf('\n\n');split>=0;split=buffer.indexOf('\n\n')){
    const block=buffer.slice(0,split);buffer=buffer.slice(split+2);
    let event='message',data='';
    for(const line of block.split('\n')){if(line.startsWith('event:'))event=line.slice(6).trim();else if(line.startsWith('data:'))data+=line.slice(5).trimStart();}
    if(data)onEvent(event,JSON.parse(data));
   }
  }
 }catch(error){throw controller.signal.aborted&&!signal.aborted?controller.signal.reason:error;}
 finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

/** Progress for one generation, fed by whichever stream carries it. */
export class GenerationFeed{
 private state?:JobState;private failure?:Error;private wake=()=>{};
 private changed=new Promise<void>(resolve=>{this.wake=resolve;});
 private controller=new AbortController();
 constructor(readonly request?:unknown){}
 get signal(){return this.controller.signal;}
 get settled(){return !!this.failure||(!!this.state&&this.state.status!=='working');}
 push(state:JobState){this.state=state;this.notify();}
 fail(error:Error){this.failure??=error;this.notify();}
 private notify(){const wake=this.wake;this.changed=new Promise(resolve=>{this.wake=resolve;});wake();}
 async first(){while(!this.state){if(this.failure)throw this.failure;await this.changed;}return this.state;}
 /** The latest state once it changes, or after `ms` so callers can check cancellation. */
 async next(ms=1000){await Promise.race([this.changed,delay(ms)]);if(this.failure)throw this.failure;return this.state!;}
 close(){this.controller.abort();}
 /** After the first stream ends early, rejoin by request body (or poll a JSON-only server). */
 async continue(error?:unknown){
  for(let attempt=0;!this.settled&&!this.signal.aborted;attempt++){
   if(error!==undefined&&!retryable(error)){this.fail(error as Error);return;}
   if(this.state?.status==='working'&&this.state.id&&!this.request)return this.poll(this.state.id);
   if(!this.request||attempt>=REJOIN_ATTEMPTS){this.fail(Error('Lost contact with the generation server. Your dance may still be rendering; repeat the command to reconnect.'));return;}
   error=await this.stream('generate',this.request);
  }
 }
 /** Follow one stream; returns the error that ended it, if it ended early. */
 async stream(url:string,body:unknown){
  let streamError:Error|undefined,polledId:string|undefined;
  try{
   await postEvents(url,body,(event,data)=>{
    if(event==='job')this.push(data);
    else if(event==='error')streamError=Error(data.error||'Generation failed. Please retry the command.');
    else if(event==='json'){this.push(data);if(data.status==='working')polledId=data.id;}
   },this.signal);
  }catch(error){if(this.signal.aborted)return;return error;}
  if(streamError){this.fail(streamError);return;}
  if(polledId){await this.poll(polledId);return;}
  if(!this.settled)return Object.assign(Error('The generation stream ended early.'),{name:'StreamEnded'});
 }
 private async poll(id:string){
  while(!this.settled&&!this.signal.aborted){
   await delay(500);
   try{this.push(await requestJson('job/'+id));}catch(error){this.fail(error as Error);}
  }
 }
}

const commandFeeds=new Map<string,GenerationFeed>();

/** Start (or rejoin) a generation and follow it on the serving instance. */
export function followGeneration(request:unknown){
 const feed=new GenerationFeed(request);
 void feed.stream('generate',request).then(error=>feed.continue(error));
 return feed;
}
/** The feed a streamed command already opened for its early-started dance. */
export function takeCommandGeneration(id:string){const feed=commandFeeds.get(id);commandFeeds.delete(id);return feed;}

/**
 * Interpret a command. The reply streams the plan, then progress of any dance
 * the server started early, on the same connection and therefore the same instance.
 */
export function requestCommand<T extends {generationId?:string;generationRequest?:unknown}>(body:unknown):Promise<T>{
 return new Promise<T>((resolve,reject)=>{
  const controller=new AbortController();let command:T|undefined,feed:GenerationFeed|undefined;
  const deadline=setTimeout(()=>{if(!command)controller.abort(new DOMException('Command timed out','TimeoutError'));},COMMAND_MS);
  const accept=(value:T)=>{
   command=value;clearTimeout(deadline);
   if(value.generationId){
    feed=new GenerationFeed(value.generationRequest);commandFeeds.set(value.generationId,feed);
    // Closing the feed (cancelled or finished) also closes this request.
    feed.signal.addEventListener('abort',()=>controller.abort(),{once:true});
   }
   resolve(value);
  };
  postEvents('command',body,(event,data)=>{
   if(event==='json'||event==='command')accept(data);
   else if(event==='job')feed?.push(data);
   else if(event==='error'){if(feed)feed.fail(Error(data.error||'Generation failed. Please retry the command.'));else if(!command)reject(Error(data.error||'Command failed. Please retry the command.'));}
  },controller.signal).then(()=>{
   if(!command){reject(Error('The server ended the command without a reply. Please retry the command.'));return;}
   // A JSON-only server sent just the plan: follow its job by ID instead.
   if(feed&&!feed.settled&&!feed.request)feed.push({id:command.generationId!,status:'working'});
   if(feed&&!feed.settled)void feed.continue(Object.assign(Error('The generation stream ended early.'),{name:'StreamEnded'}));
  },error=>{
   clearTimeout(deadline);
   if(!command){reject((error as Error).name==='TimeoutError'?Error('Computer request timed out. Please retry the command.'):error);return;}
   if(feed&&!feed.signal.aborted)void feed.continue(error);
  });
 });
}
