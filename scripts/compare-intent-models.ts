import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import {routeIntent} from '../server/intent-router.ts';
const client=new OpenAI({maxRetries:0,timeout:20000});
const base={identity:'Tommy',character:'celery',costume:'gray suit, white shirt, black shoes',pending:'',history:[],scriptStep:1};
const cases=[
 {text:'Computer load of salary man please',expected:'celery'},
 {text:'Load up Potato Boy',expected:'new_character'},
 {text:'Add a little backward shuffle to this',expected:'modify_current'},
 {text:'And give him a red hat',expected:'modify_current'},
 {text:'Do not load Celery Man',expected:'reaction'},
 {text:'Do you have a new sequence involving a robot?',expected:'dialogue'},
 {text:'What kind of dance would suit Potato Boy?',expected:'dialogue'},
 {text:'Yes, show me',expected:'new_character',context:{pending:'dialogue',conversation:[{role:'assistant' as const,content:'I have a robot in a silver boiler suit doing the sprinkler. Would you like to see it?'}]}},
 {text:'Sure',expected:'modify_current',context:{pending:'dialogue',conversation:[{role:'assistant' as const,content:'I can add a backward shuffle to the current dancer, keeping his outfit. Shall I?'}]}},
 {text:'No thanks',expected:'cancel',context:{pending:'dialogue'}},
 {text:'Now Tain I can get into',expected:'reaction'},
 {text:'And a bargain stow',expected:'flarhgunnstow',context:{scriptStep:10}}
];
const rows=[];
for(let i=0;i<cases.length;i++){
 const c=cases[i];
 for(const model of (i%2?['gpt-4.1-mini','gpt-6-luna']:['gpt-6-luna','gpt-4.1-mini'])){
  const r=await routeIntent(client,c.text,{...base,...c.context},'low',model);
  const row={model,text:c.text,expected:c.expected,intent:r.intent,response:r.command?.response,ms:Math.round(r.elapsedMs),tier:r.serviceTier};rows.push(row);console.log(JSON.stringify(row));
 }
}
await fs.mkdir('benchmarks/intent-router',{recursive:true});await fs.writeFile('benchmarks/intent-router/model-comparison.json',JSON.stringify(rows,null,2));
for(const model of ['gpt-6-luna','gpt-4.1-mini']){const r=rows.filter(x=>x.model===model),t=r.map(x=>x.ms).sort((a,b)=>a-b);console.log(model,{correct:r.filter(x=>x.intent===x.expected).length,total:r.length,medianMs:(t[5]+t[6])/2});}
if(rows.some(x=>x.model==='gpt-6-luna'&&x.intent!==x.expected))process.exitCode=1;
