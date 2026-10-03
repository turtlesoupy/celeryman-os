import fs from 'node:fs/promises';
const files=(await fs.readdir('benchmarks/voice-inputs')).filter(x=>x.endsWith('.wav'));
const results=await Promise.all(files.map(async file=>{const r=await fetch('http://127.0.0.1:5173/api/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audio:(await fs.readFile('benchmarks/voice-inputs/'+file)).toString('base64'),mime:'audio/wav'})});return {file,...await r.json()};}));
await fs.writeFile('benchmarks/transcription-check.json',JSON.stringify(results,null,2));console.log(results);
