import fs from 'node:fs/promises';
import {costumes,motions} from '../src/dances';
const profile=process.argv[2]||'paul';
const variants=[['celery','base'],['celery','face'],['celery','engaged'],['oyster','base'],['oyster','face'],['tayne','base'],['tayne','intro'],['tayne','sway'],['tayne','hat'],['tayne','flarhgunnstow'],['mozzarell','base'],['mozzarell','face']];
const results=await Promise.all(variants.map(async([character,variant])=>{
 const body={profile,character,variant,canonical:true,costume:costumes[character],motion:variant==='intro'?`Tight head-and-shoulders close up. Face fills most of the vertical frame, head and upper chest only. Light gray background. Look at camera and say in a warm natural American male voice: Hey Paul. I'm Tayne, your latest dancer. I can't wait to entertain you. Keep the same clothing, face, and fixed camera.`:motions[variant]||motions[character]};
 let job=await(await fetch('http://127.0.0.1:5173/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
 console.log(character,variant,job.id,job.status);
 while(job.status==='working'){await new Promise(r=>setTimeout(r,3000));job=await(await fetch('http://127.0.0.1:5173/api/job/'+job.id)).json();}
 console.log(character,variant,job.status,job.error||job.elapsed);return {body,...job};
}));await fs.writeFile('benchmarks/prepared-assets.json',JSON.stringify(results,null,2));
