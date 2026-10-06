import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {routeIntent} from '../server/intent-router.ts';
const client=new OpenAI({maxRetries:0,timeout:20000});
const cases:[string,string,number,string][]=[
 ['Computer, line up Celery Man, please.','celery',1,''],
 ['Computer load of salary man please','celery',1,''],
 ['A celery man please','celery',1,''],
 ['Load up Potato Boy','custom',1,''],
 ['Add sequence Oyster Dog','custom',3,''],
 ['Load up Wolfman','custom',1,''],
 ['Celery Man in a blue suit','custom',1,''],
 ['Do not load Celery Man','reaction',1,''],
 ['Make his hat wobble twice as slow','custom',9,''],
 ['And a bargain stow','flarhgunnstow',10,''],
 ['Now Tain I can get into','reaction',8,''],
 ['Sounds good, show it to me','tayne',7,'beta'],
 ['No thanks','cancel',7,'beta'],
 ['Print Oyster smiling','print',4,'']
];
const rows=[];
for(const effort of ['low','none'] as const){
 for(const [text,expected,scriptStep,pending] of cases){
  const r=await routeIntent(client,text,{identity:'Tommy',character:'WOLFMANCLAW',pending,history:[],scriptStep},effort);
  const actual=r.command?.action??'custom';rows.push({effort,text,expected,actual,ms:Math.round(r.elapsedMs),tier:r.serviceTier});
  console.log(JSON.stringify(rows.at(-1)));
 }
}
await fs.mkdir('benchmarks/intent-router',{recursive:true});await fs.writeFile('benchmarks/intent-router/results.json',JSON.stringify(rows,null,2));
for(const effort of ['low','none']){const r=rows.filter(x=>x.effort===effort),times=r.map(x=>x.ms).sort((a,b)=>a-b);console.log(effort,{correct:r.filter(x=>x.actual===x.expected).length,total:r.length,medianMs:times[Math.floor(times.length/2)]});}
assert(rows.every(x=>x.actual===x.expected),'Intent regression');
