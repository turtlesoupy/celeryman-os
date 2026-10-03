import fs from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {grade,rubric} from './voice-lab-grade.mjs';
const r=JSON.parse(await fs.readFile('public/voice-lab/report.json','utf8'));
// Fixed per-recording gain for fair listening; never change pitch, timing or dynamics here.
// Use measured RMS scalar (not dynamic loudness processing) for transparent level matching.
const py=`import sys,subprocess,numpy as np\nfrom scipy.io import wavfile\nx=np.frombuffer(subprocess.check_output(['ffmpeg','-v','error','-i',sys.argv[1],'-ar','24000','-ac','1','-f','f32le','-']),np.float32)\ne=np.sqrt(np.convolve(x*x,np.ones(480)/480,'same'));a=x[e>max(e.max()*.08,.001)]\nrms=np.sqrt(np.mean(a*a)) if len(a) else .01\ng=min(10**(-23/20)/max(rms,1e-9),.92/max(np.max(abs(x)),1e-9))\nwavfile.write(sys.argv[2],24000,(x*g*32767).astype(np.int16))\n`;
await fs.writeFile('cache/voice-lab-normalize.py',py);
function level(url){const out=url.replace(/\.wav$/,'-listen.wav');execFileSync('python3',['cache/voice-lab-normalize.py','public'+url,'public'+out]);return out;}
for(const c of r.cases){const local='/voice-lab/audio/ref-'+c.id+'.wav';await fs.copyFile('public'+c.reference,'public'+local);c.listenReference=level(local);}
for(const c of [...r.candidates,...r.controls])if(c.url)c.listenUrl=level(c.url);
await fs.writeFile('public/voice-lab/report.json',JSON.stringify(r,null,2));await fs.writeFile('benchmarks/voice-lab/report.json',JSON.stringify(r,null,2));
const results={model:'gemini-3.8-flash',created:new Date().toISOString(),rubric,notes:'Two blinded, independently ordered judgments per sample. Latency and model names withheld. Not a calibrated perceptual percentage. Independent prompts, not independent model families.',grades:[],errors:[]};
const save=async()=>{await fs.writeFile('public/voice-lab/grades.json',JSON.stringify(results,null,2));await fs.writeFile('benchmarks/voice-lab/grades.json',JSON.stringify(results,null,2));};
// Two concurrent independent grader requests; preserve every returned grade, including disagreements.
for(const c of r.cases){
 const candidates=[...r.candidates,...r.controls].filter(x=>x.caseId===c.id&&x.url).map(x=>({id:x.id,text:x.text,file:'public'+x.listenUrl}));
 const outcomes=await Promise.allSettled([1,2].map(pass=>grade('public'+c.listenReference,candidates,`${c.id}-pass-${pass}`)));
 outcomes.forEach((o,i)=>{if(o.status==='fulfilled')results.grades.push(...o.value);else results.errors.push({case:c.id,pass:i+1,error:String(o.reason)});});await save();console.log(c.id,results.grades.filter(g=>candidates.some(c=>c.id===g.id)).map(g=>[g.id,g.voice_fidelity]));
}
const mean=id=>{const g=results.grades.filter(g=>g.id===id);return g.length?g.reduce((s,g)=>s+g.voice_fidelity,0)/g.length:null;};const positiveMean=mean('control-positive'),negativeMean=mean('control-negative');results.controls={positiveMean,negativeMean,passed:positiveMean>=95&&negativeMean<75&&positiveMean-negativeMean>=25};await save();
