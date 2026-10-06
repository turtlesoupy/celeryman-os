import type {IncomingMessage,ServerResponse} from 'node:http';

export type Job={previewUrl?:string;status:string;stage:string;url?:string;image?:string;music?:string;error?:string;started?:number;elapsed?:number;requestId?:string;providerStatus?:string;timings?:Record<string,number>};
type Entry={job:Job;listeners:Set<()=>void>};

// Jobs live only on the instance doing the work. Progress reaches the browser
// over the same request that started (or joined) the job, so no instance ever
// needs another instance's state; finished media is shared through the bucket.
const shared=globalThis as typeof globalThis & {cincoJobEntries?:Map<string,Entry>};
const entries=shared.cincoJobEntries??=new Map<string,Entry>();
const starting=new Map<string,Promise<Job>>();
// Settled jobs briefly answer repeat requests without a bucket lookup.
const RETAIN_SETTLED_MS=10*60000;

export const getJob=(id:string)=>entries.get(id)?.job;
export function activeJobCount(){let count=0;for(const {job} of entries.values())if(job.status==='working'&&job.started)count++;return count;}

/** Register a job whose property writes notify every stream following it. */
export function trackJob(id:string,initial:Job):Job{
 const listeners=new Set<()=>void>();let queued=false,retirement:NodeJS.Timeout|undefined;
 const retire=()=>{clearTimeout(retirement);retirement=setTimeout(()=>{if(entries.get(id)===entry)entries.delete(id);},RETAIN_SETTLED_MS);retirement.unref();};
 const notify=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;for(const listener of [...listeners])listener();if(job.status!=='working')retire();});};
 const job:Job=new Proxy(initial,{set(target,key,value){(target as any)[key]=value;notify();return true;}});
 const entry={job,listeners};entries.set(id,entry);
 if(initial.status!=='working')retire();
 return job;
}

/** Join this instance's job for id, reuse saved media, or start exactly one new run. */
export function startJob(id:string,saved:()=>Promise<Job|undefined>,run:(job:Job)=>void):Promise<Job>{
 const current=getJob(id);
 if(current&&current.status!=='error')return Promise.resolve(current);
 let pending=starting.get(id);
 if(!pending){
  pending=(async()=>{
   const found=await saved();if(found)return trackJob(id,found);
   const job=trackJob(id,{status:'working',stage:'Queued'});run(job);return job;
  })().finally(()=>starting.delete(id));
  starting.set(id,pending);
 }
 return pending;
}

export type EventStream={send:(event:string,data:unknown)=>void;end:()=>void;readonly closed:boolean;onClose:(listener:()=>void)=>void};
export function openEventStream(req:IncomingMessage,res:ServerResponse):EventStream{
 res.statusCode=200;
 res.setHeader('Content-Type','text/event-stream; charset=utf-8');
 res.setHeader('Cache-Control','no-store, no-transform');
 res.setHeader('X-Accel-Buffering','no');
 res.flushHeaders();req.socket.setKeepAlive(true);
 let closed=false;const closers=new Set<()=>void>();
 // Comments keep proxies from treating a quiet render as an idle connection.
 const heartbeat=setInterval(()=>{if(!closed)res.write(': heartbeat\n\n');},10000);
 // A disconnect stops writing but never aborts paid generation: the result is
 // still persisted for the retry or the next identical request.
 res.on('close',()=>{closed=true;clearInterval(heartbeat);for(const listener of closers)listener();});
 return {
  send(event,data){if(!closed&&!res.writableEnded)res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);},
  end(){clearInterval(heartbeat);if(!res.writableEnded)res.end();},
  get closed(){return closed;},
  onClose(listener){if(closed)listener();else closers.add(listener);},
 };
}

/** Send `job` events until the job settles or the browser disconnects. */
export function followJob(stream:EventStream,id:string,job:Job):Promise<void>{
 let last='';
 const emit=()=>{const state=JSON.stringify({id,...job});if(state!==last){last=state;stream.send('job',JSON.parse(state));}};
 emit();
 const entry=entries.get(id);
 if(job.status!=='working'||!entry||entry.job!==job)return Promise.resolve();
 return new Promise(resolve=>{
  const finish=()=>{entry.listeners.delete(listener);resolve();};
  const listener=()=>{emit();if(job.status!=='working')finish();};
  entry.listeners.add(listener);stream.onClose(finish);
 });
}
