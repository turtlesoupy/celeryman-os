import 'dotenv/config';
import fs from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import type {Plugin} from 'vite';
import {fal} from '@fal-ai/client';
import OpenAI from 'openai';
import {personalizedVoice} from './personalized-voice.ts';
const exec=promisify(execFile);
export const labDir='public/voice-lab/audio';
import {clonedStream,pcmWav} from './computer-voice.ts';
export {clonedStream,pcmWav} from './computer-voice.ts';
export async function classicVoice(text:string,voice:string,file:string){
 if(!['Fred','Ralph','Albert','Zarvox','Junior','Alex'].includes(voice))throw Error('Unknown classic voice');
 const p=JSON.parse(await fs.readFile(`benchmarks/voice-lab/classic-${voice}.json`,'utf8'));
 const raw=file+'.raw.wav';
 try{
  await exec('say',['-v',voice,'-r',String(p.rate),'-o',raw,'--data-format=LEI16@24000',text.replace(/[\[\]]/g,'')],{timeout:30000});
  const effects=[`asetrate=${24000*p.pitchRatio}`,'aresample=24000',`atempo=${1/p.pitchRatio}`,...p.eq.map(([hz,gain]:number[])=>`equalizer=f=${hz}:t=o:w=1:g=${gain}`),`volume=${p.gain}`,'alimiter=limit=0.95:level=false:latency=true'];
  await exec('ffmpeg',['-y','-v','error','-i',raw,'-af',effects.join(','),'-ar','24000','-ac','1','-c:a','pcm_s16le',file],{timeout:30000});
 }finally{await fs.rm(raw,{force:true});}
}
export async function spliceVoice(text:string,session:string,onStage?:(stage:string)=>void){
 fal.config({credentials:process.env.FAL_KEY});
 const url=await personalizedVoice(text,new OpenAI(),{cacheDirectory:`cache/voice-lab/${session}`,outputDirectory:labDir,outputUrl:'/voice-lab/audio',cacheKey:session,onStage});
 if(!url)throw Error('Splicing supports the greeting, wife-call and “Yes, NAME!” templates only. Arbitrary text requires synthesis.');return url;
}
export function voiceLabPlugin():Plugin{return {name:'voice-lab',configureServer(server){server.middlewares.use(async(req,res,next)=>{
 if(req.url==='/voice-lab/'||req.url==='/voice-lab'){res.statusCode=302;res.setHeader('Location','/voice-lab/index.html');res.end();return;}
 if(req.url?.startsWith('/voice-lab/audio/')||/^\/voice-lab\/(report|grades|browser-tests)\.json(?:\?|$)/.test(req.url||'')){
  try{
   const pathname=new URL(req.url!,'http://localhost').pathname;
   if(!/^\/voice-lab\/(?:audio\/[a-zA-Z0-9.-]+\.wav|(?:report|grades|browser-tests)\.json)$/.test(pathname))throw Error('Invalid asset');
   const bytes=await fs.readFile('public'+pathname);res.setHeader('Content-Type',pathname.endsWith('.wav')?'audio/wav':'application/json');res.setHeader('Cache-Control','no-store');res.setHeader('Accept-Ranges','bytes');
   const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
   if(start>end||start>=bytes.length){res.statusCode=416;res.setHeader('Content-Range',`bytes */${bytes.length}`);res.end();return;}
   if(range){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}res.setHeader('Content-Length',end-start+1);res.end(req.method==='HEAD'?undefined:bytes.subarray(start,end+1));
  }catch{res.statusCode=404;res.end('Voice lab asset not found');}return;
 }
 if(req.url!=='/api/voice-lab')return next();
 const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
 try{
 if(req.method!=='POST')throw Error('POST required');
 if(req.headers.origin&&!/^http:\/\/(localhost|127\.0\.0\.1):5173$/.test(req.headers.origin))throw Error('Local requests only');
 let raw='';for await(const c of req){raw+=c;if(raw.length>8000)throw Error('Request too large');}
 const b=JSON.parse(raw),text=String(b.text||'').trim();if(!text||text.length>600)throw Error('Enter 1–600 characters');
 const start=performance.now();await fs.mkdir(labDir,{recursive:true});const id=randomUUID(),file=`${labDir}/live-${id}.wav`;
 res.setHeader('Cache-Control','no-store');
 if(b.method==='turbo'||b.method==='hd'){
  res.setHeader('Content-Type','application/x-ndjson');res.flushHeaders();
  const send=(x:unknown)=>{if(!res.destroyed)res.write(JSON.stringify(x)+'\n');};
  const result=await clonedStream(text,b.method,chunk=>send({type:'pcm',data:chunk.toString('base64')}),controller.signal);
  await fs.writeFile(file,pcmWav(result.pcm));send({type:'done',url:`/voice-lab/audio/live-${id}.wav`,firstChunkMs:result.firstChunkMs,completeMs:performance.now()-start});res.end();
 }else{
  let url:string;
  if(b.method==='classic'){await classicVoice(text,String(b.voice||'Ralph'),file);url=`/voice-lab/audio/live-${id}.wav`;}
  else if(b.method==='splice'){const session=String(b.session||'browser').replace(/[^a-zA-Z0-9-]/g,'').slice(0,80);url=await spliceVoice(text,session);}
  else throw Error('Unknown voice approach');
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({url,completeMs:performance.now()-start}));
 }
 }catch(e){const detail=e as {name?:string;message?:string;status?:number;body?:unknown};const error=detail.message||JSON.stringify({name:detail.name,status:detail.status,body:detail.body})||'Voice generation failed';console.warn('Voice lab failure:',error);if(res.headersSent){if(!res.destroyed)res.end(JSON.stringify({type:'error',error})+'\n');}else{res.statusCode=400;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error}));}}
 });}};}
