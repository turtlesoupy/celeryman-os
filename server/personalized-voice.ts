import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import OpenAI from 'openai';
import {fal} from '@fal-ai/client';
const exec=promisify(execFile);
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
const words=async(file:string,openai:OpenAI)=>{
 const cache=file+'.words.json';
 try{return JSON.parse(await fs.readFile(cache,'utf8')) as {word:string;start:number;end:number}[];}catch{}
 const result=await openai.audio.transcriptions.create({model:'whisper-1',file:createReadStream(file),response_format:'verbose_json',timestamp_granularities:['word']});
 if(!result.words?.length)throw Error('No alignment returned for personalized voice');
 await fs.writeFile(cache,JSON.stringify(result.words));return result.words;
};
function span(items:{word:string;start:number;end:number}[],name:string){
 const target=normalize(name);
 for(let i=0;i<items.length;i++){let text='';for(let j=i;j<Math.min(items.length,i+6);j++){text+=normalize(items[j].word);if(text===target)return {start:i?items[i-1].end:Math.max(0,items[i].start-.12),end:items[j+1]?(items[j].end+items[j+1].start)/2:items[j].end+.12};if(text.length>=target.length)break;}}
 throw Error('Personalized name was not pronounced correctly');
}
export async function personalizedVoice(text:string,openai:OpenAI):Promise<string|undefined>{
 const greeting=/^Good morning (.+?)\.\s*What will your first sequence of the day be\?$/i.exec(text);
 const call=/^Excuse me (.+?)\. Your wife is on the phone\. It's an emergency\.$/i.exec(text);
 const yes=/^Yes,? (.+?)[!.]$/i.exec(text);
 const match=greeting||call||yes;if(!match)return;
 const name=match[1],source=greeting?'greeting':call?'call':'yes-paul';
 const id=createHash('sha256').update('personalized-units-v2:'+text).digest('hex').slice(0,20);
 const output=`public/media/voice/${id}.wav`;
 try{await fs.access(output);return '/media/voice/'+id+'.wav';}catch{}
 await fs.mkdir('cache/voice-units',{recursive:true});
 const reference='public/media/original/greeting.wav';
 const line=`Good morning ${name}. What will your first sequence of the day be?`;
 const nameKey=createHash('sha256').update('computer-name:'+name.toLowerCase()).digest('hex').slice(0,20);
 const sample=`cache/voice-units/name-${nameKey}.wav`;
 let generated:any;
 try{await fs.access(sample);}catch{
 const ref=await fal.storage.upload(new File([await fs.readFile(reference)],'computer.wav',{type:'audio/wav'}));
  generated=await fal.subscribe('fal-ai/f5-tts',{input:{gen_text:line,ref_audio_url:ref,ref_text:'Good morning Paul. What will your first sequence of the day be?',model_type:'F5-TTS',remove_silence:true}}) as any;
  const response=await fetch(generated.data.audio_url.url);if(!response.ok)throw Error('Voice download failed');await fs.writeFile(sample,Buffer.from(await response.arrayBuffer()));
 }
 const original=`public/media/original/${source}.wav`;
 const [sourceWords,newWords]=await Promise.all([words(original,openai),words(sample,openai)]);
 const oldSpan=span(sourceWords,'Paul'),newSpan=span(newWords,name);
 // Preserve the source synthesizer around a generated and verified name unit.
 // Tiny fades suppress splice clicks; there is no browser speech-synthesis fallback.
 const graph=`[0:a]atrim=end=${Math.max(0,oldSpan.start-.015)},asetpts=PTS-STARTPTS,afade=t=out:st=${Math.max(0,oldSpan.start-.025)}:d=0.01[a];[1:a]atrim=start=${Math.max(0,newSpan.start-.01)}:end=${newSpan.end+.025},asetpts=PTS-STARTPTS,afade=t=in:d=0.01,areverse,afade=t=in:d=0.01,areverse[b];[0:a]atrim=start=${oldSpan.end},asetpts=PTS-STARTPTS,afade=t=in:d=0.01[c];[a][b][c]concat=n=3:v=0:a=1[out]`;
 const temporary=output+'.tmp.wav';await exec('ffmpeg',['-y','-i',original,'-i',sample,'-filter_complex',graph,'-map','[out]','-ar','24000','-ac','1','-c:a','pcm_s16le',temporary,'-loglevel','error']);await fs.rename(temporary,output);
 await fs.writeFile(output+'.json',JSON.stringify({source,requestedText:text,name,originalNameSpan:oldSpan,generatedNameSpan:newSpan,nameModel:'fal-ai/f5-tts',requestId:generated?.requestId,method:'Original computer phrase with a generated, word-aligned name; 10 ms boundary fades.'},null,2));
 return '/media/voice/'+id+'.wav';
}
