import fs from 'node:fs/promises';
import {randomInt, randomUUID} from 'node:crypto';
import {clonedStream, pcmWav} from '../server/computer-voice.ts';

// Separate from the production voice and phrase cache. Keep provider identities
// out of the listening manifest; fetch the key only after ratings are complete.
const dir='public/voice-ab';
const archive='benchmarks/voice-ab-20261005';
await fs.mkdir(`${dir}/audio`,{recursive:true});
await fs.mkdir(archive,{recursive:true});
const texts=[
 'Good morning Thomas. What will your first sequence of the day be?',
 'Good morning Maya. What will your first sequence of the day be?',
 'Celery Man is ready. Shall I turn up the volume?',
 'Now loading your requested sequence. Please stand by.',
 'Your wife is calling. Would you like me to put her through?',
 'I am sorry, Thomas. I could not complete that request. Would you like to try again?'
];
const rounds:any[]=[],key:any[]=[],measurements:any[]=[];
function levelMatch(pcm:Buffer){
 let squares=0,peak=0;
 for(let i=0;i<pcm.length;i+=2){const x=pcm.readInt16LE(i);squares+=x*x;peak=Math.max(peak,Math.abs(x));}
 const rms=Math.sqrt(squares/(pcm.length/2));
 if(!rms)throw Error('Silent sample');
 const gain=Math.min(32768*10**(-22/20)/rms,32767*.95/peak);
 const result=Buffer.alloc(pcm.length);
 for(let i=0;i<pcm.length;i+=2)result.writeInt16LE(Math.round(pcm.readInt16LE(i)*gain),i);
 return result;
}
for(const [i,text] of texts.entries()){
 const samples:Record<string,string>={};
 for(const tier of i%2?['turbo','hd'] as const:['hd','turbo'] as const){
  const result=await clonedStream(text,tier,()=>{});
  const name=randomUUID()+'.wav';
  await fs.writeFile(`${dir}/audio/${name}`,pcmWav(levelMatch(result.pcm)));
  samples[tier]='audio/'+name;
  measurements.push({round:i+1,tier,text,firstChunkMs:result.firstChunkMs,completeMs:result.completeMs,requestId:result.requestId});
  console.log(`Prepared sample ${measurements.length}/12`);
 }
 const order=randomInt(2)?['hd','turbo']:['turbo','hd'];
 rounds.push({id:i+1,text,A:samples[order[0]],B:samples[order[1]]});
 key.push({id:i+1,A:order[0],B:order[1]});
 await fs.writeFile(`${archive}/measurements.json`,JSON.stringify(measurements,null,2));
}
const id=randomUUID();
await fs.writeFile(`${dir}/rounds.json`,JSON.stringify({id,rounds},null,2));
await fs.writeFile(`${dir}/reveal.json`,JSON.stringify({id,key},null,2));
await fs.writeFile(`${archive}/key.json`,JSON.stringify({id,key},null,2));
console.log('Ready: http://127.0.0.1:5173/voice-ab/');
