import fs from 'node:fs/promises';
import path from 'node:path';
// Logging never delays a request. In production the file lives on a Cloud
// Storage mount where every append rewrites the object, so queued lines are
// batched into a single append; stdout already reaches Cloud Logging.
let pending:string[]=[],flushing:Promise<void>|undefined;
async function flush(){
 const dir=path.join(process.cwd(),'cache/diagnostics');
 try{
  while(pending.length){
   const lines=pending.join('');pending=[];
   try{await fs.mkdir(dir,{recursive:true});await fs.appendFile(path.join(dir,'commands.jsonl'),lines);}
   catch{console.warn('Could not write command diagnostic');}
  }
 }finally{flushing=undefined;}
}
export function logDiagnostic(event:Record<string,unknown>){
 const time=new Date().toISOString();
 console.log(JSON.stringify({severity:event.event==='generation-error'||event.event==='request-error'?'ERROR':'INFO',time,...event}));
 pending.push(JSON.stringify({time,...event})+'\n');
 flushing??=flush();
}
