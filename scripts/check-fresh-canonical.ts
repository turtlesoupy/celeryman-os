import fs from 'node:fs/promises';import {costumes,motions} from '../src/dances.ts';
const api=async(url:string,body?:any)=>{const r=await fetch('http://127.0.0.1:5173/api/'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return r.json() as Promise<any>;};
const profile=await api('profile',{image:(await fs.readFile('reference/thomas-dimson.jpg')).toString('base64')});
const start=performance.now();let job=await api('generate',{profile:profile.id,canonical:true,character:'celery',variant:'base',costume:costumes.celery,motion:motions.celery});
while(job.status==='working'){await new Promise(r=>setTimeout(r,150));job=await api('job/'+job.id);}
const report={...job,wallMs:performance.now()-start};await fs.writeFile('benchmarks/responsiveness/fresh-canonical.json',JSON.stringify(report,null,2));console.log(report);if(job.status!=='complete')process.exitCode=1;
