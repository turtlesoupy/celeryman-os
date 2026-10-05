import fs from 'node:fs/promises';
import path from 'node:path';
export async function logDiagnostic(event:Record<string,unknown>){
 console.log(JSON.stringify({severity:event.event==='generation-error'||event.event==='request-error'?'ERROR':'INFO',time:new Date().toISOString(),...event}));
 const dir=path.join(process.cwd(),'cache/diagnostics');
 try{await fs.mkdir(dir,{recursive:true});await fs.appendFile(path.join(dir,'commands.jsonl'),JSON.stringify({time:new Date().toISOString(),...event})+'\n');}
 catch{console.warn('Could not write command diagnostic');}
}
