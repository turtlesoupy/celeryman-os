import fs from 'node:fs/promises';
const site=process.env.BENCHMARK_SITE||'https://celeryman.fun';
const rows:any[]=[];
for(let round=0;round<2;round++)for(const clip of ['01','02','09','10','13','16']){
 const audio=(await fs.readFile(`benchmarks/voice-inputs/${clip}.wav`)).toString('base64');
 const start=performance.now();
 const response=await fetch(site+'/api/transcribe',{method:'POST',headers:{Origin:site,'Content-Type':'application/json'},body:JSON.stringify({audio,mime:'audio/wav',requestId:`latency-${round}-${clip}`}),signal:AbortSignal.timeout(30000)});
 const result=await response.json();if(!response.ok)throw Error(result.error);
 const row={round,clip,model:result.model,text:result.text,providerMs:result.transcriptionMs,totalMs:Math.round(performance.now()-start)};
 rows.push(row);console.log(JSON.stringify(row));
}
await fs.mkdir('benchmarks/latency',{recursive:true});
await fs.writeFile(`benchmarks/latency/deployed-transcription-${process.env.BENCHMARK_LABEL||'before'}.json`,JSON.stringify({created:new Date().toISOString(),site,rows},null,2)+'\n');
