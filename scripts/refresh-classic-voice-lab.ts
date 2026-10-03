import fs from 'node:fs/promises';import {classicVoice} from '../server/voice-lab.ts';
const report=JSON.parse(await fs.readFile('public/voice-lab/report.json','utf8'));
await fs.writeFile('benchmarks/voice-lab/report-before-local-optimization.json',JSON.stringify(report,null,2));
for(const c of report.candidates.filter((c:any)=>c.method.startsWith('classic'))){c.previousTrials=c.trials;c.trials=[];for(let trial=1;trial<=3;trial++){const start=performance.now(),url=`/voice-lab/audio/${c.id}-${trial}.wav`;await classicVoice(c.text,c.method==='classic-fred'?'Fred':'Junior','public'+url);c.trials.push({trial,url,completeMs:performance.now()-start});}console.log(c.id,c.trials.map((t:any)=>t.completeMs));}
report.notes.push('Classic runtime invokes say and ffmpeg directly. Earlier Python-launch timing trials are retained separately as previousTrials, not included in current summaries.');
await fs.writeFile('public/voice-lab/report.json',JSON.stringify(report,null,2));await fs.writeFile('benchmarks/voice-lab/report.json',JSON.stringify(report,null,2));
