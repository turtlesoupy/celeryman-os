import fs from 'node:fs/promises';
import {costumes,motions} from '../src/dances.ts';

const site=process.env.BENCHMARK_SITE||'https://celeryman.fun';
const post=async(endpoint:string,body:any)=>{
 const r=await fetch(site+'/api/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json',Origin:site},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 const result=await r.json();if(!r.ok||result.error)throw Error(result.error||String(r.status));return result;
};
const {id:profile}=await post('profile',{image:(await fs.readFile('reference/thomas-dimson.jpg')).toString('base64')});
const results:any[]=[];
for(const scenario of ['custom','celery','portrait']){
 const start=performance.now();let job:any,planningMs:number|undefined;
 if(scenario==='custom'){
  const command=await post('command',{profile,text:'Computer, show me an exaggerated shoulder shimmy in a mustard yellow tracksuit.',context:{identity:'Thomas',character:'celery',pending:'',history:[]}});
  planningMs=performance.now()-start;
  if(!command.generationId)throw Error('Planner did not start generation');
  job=await(await fetch(site+'/api/job/'+command.generationId)).json();
 }else job=await post('generate',{profile,character:'celery',variant:scenario==='portrait'?'face':'base',canonical:true,costume:costumes.celery,motion:scenario==='portrait'?motions.face:motions.celery});
 let previewMs:number|undefined,firstBytesMs:number|undefined;
 while(job.status==='working'){
  if(job.previewUrl&&previewMs===undefined){
   previewMs=performance.now()-start;
   const r=await fetch(site+job.previewUrl,{headers:{Range:'bytes=0-1023'}});
   if(!r.ok)throw Error('Preview failed: '+r.status);await r.arrayBuffer();firstBytesMs=performance.now()-start;
  }
  if(performance.now()-start>120000)throw Error('Generation timed out');
  await new Promise(r=>setTimeout(r,120));
  job=await(await fetch(site+'/api/job/'+job.id)).json();
 }
 if(job.status==='error')throw Error(job.error);
 const meta=await(await fetch(site+job.url.replace('.mp4','.json'))).json();
 const result={scenario,profile,id:job.id,planningMs,previewMs,firstBytesMs,wallMs:performance.now()-start,timings:meta.timings,providerTimings:meta.providerTimings,model:meta.model,costumeFrame:meta.costumeFrame};
 results.push(result);console.log(JSON.stringify(result));
}
await fs.mkdir('benchmarks/latency',{recursive:true});
await fs.writeFile(`benchmarks/latency/production-${process.env.BENCHMARK_LABEL||'before'}.json`,JSON.stringify({created:new Date().toISOString(),site,results},null,2)+'\n');
