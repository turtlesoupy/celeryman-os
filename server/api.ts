import {commandPlanFormat,validateCommandPlan} from './command-plan.ts';
import {logDiagnostic} from './diagnostics.ts';
import 'dotenv/config';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {Readable} from 'node:stream';
import {videoPreviews} from './video-preview.ts';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
import {createHash,randomUUID} from 'node:crypto';
import OpenAI from 'openai';
import {transcribeAudio,transcriptionSession} from './transcription.ts';
import {fal} from '@fal-ai/client';
import type {Plugin} from 'vite';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {scripted,type Context} from '../src/protocol.ts';
import {costumes,motions} from '../src/dances.ts';
import {interactiveVideo} from './interactive-video.ts';
import {savedGeneration} from './saved-generation.ts';
import {computerVoiceId,streamComputerVoice} from './computer-voice.ts';
import {canonicalName,generationKey,finishChoreography,motionPrompt} from './choreography.ts';
const openai=new OpenAI({maxRetries:0,timeout:20000});
fal.config({credentials:process.env.FAL_KEY});
const root=process.cwd(),media=path.join(root,'public/media');
type Job={previewUrl?:string;status:string;stage:string;url?:string;image?:string;music?:string;error?:string;started?:number;elapsed?:number;requestId?:string;providerStatus?:string;timings?:Record<string,number>};
const shared=globalThis as typeof globalThis & {cincoJobs?:Map<string,Job>};
const jobs=shared.cincoJobs??=new Map<string,Job>();
const frameLocks=new Map<string,Promise<string>>();
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,20);
const exists=async(p:string)=>fs.access(p).then(()=>true,()=>false);
async function saveRemote(url:string,file:string){const r=await fetch(url);if(!r.ok)throw Error('Media download failed');await fs.writeFile(file,Buffer.from(await r.arrayBuffer()));}
const references=new Map<string,Promise<string>>();
function reference(profile:string){
 if(references.has(profile))return references.get(profile)!;
 const pending=(async()=>{
 const p=profile==='paul'?path.join(root,'reference/paul-rudd.png'):profile==='thomas'?path.join(root,'reference/thomas-dimson.jpg'):path.join(media,'profiles',`${profile.replace(/[^a-z0-9-]/g,'')}.jpg`);
 return fal.storage.upload(new File([await fs.readFile(p)],'identity.jpg',{type:'image/jpeg'}));
 })();references.set(profile,pending);pending.catch(()=>references.delete(profile));return pending;
}
async function costumeFrame(profile:string,costume:string,closeup=false,canonical=''){
 const key=hash(JSON.stringify({profile,costume,closeup,canonical,version:6,revision:canonical==='mozzarell-face'?4:canonical==='engaged'?1:canonical==='intro'?1:closeup?3:canonical==='oyster'?2:canonical==='flarhgunnstow'?2:0}));
 if(frameLocks.has(key))return frameLocks.get(key)!;
 const promise=(async()=>{
  const local=path.join(media,'generated',`frame-${key}.png`);
  if(await exists(local))return fal.storage.upload(new File([await fs.readFile(local)],'frame.png',{type:'image/png'}));
  if(canonical==='flarhgunnstow'){
   const person=await costumeFrame(profile,costume,false,'tayne');
   const garment=await fal.storage.upload(new File([await fs.readFile(path.join(media,'motion/tayne-shirt-detail.png'))],'wardrobe.png',{type:'image/png'}));
   const rendered:any=await fal.subscribe('fal-ai/nano-banana-2/edit',{input:{image_urls:[person,garment],prompt:'Create one completely coherent full-body live-action photograph of the same person in image 1, dressed in precisely the same hat, sunglasses, gold necklace, black leather pants and shoes. His shirt uses the exact fabric pattern, dense gold-orange floral medallions on black and buttoned neckline from image 2. Same recognizable facial identity. Stand upright with feet apart and both arms slightly out. The whole person is visible including hat and shoes, centered and occupying only 70 percent of the image height, large empty margins above the hat for jumping. Seamless flat pure white backdrop with no floor line, no shadows, no texture, no environment. Vertical composition. Render the entire body and head naturally together with consistent lighting, not pasted layers. 1990s low-budget dance footage. No text.',aspect_ratio:'9:16',resolution:'1K',output_format:'png'}});
   await saveRemote(rendered.data.images[0].url,local);return rendered.data.images[0].url;
  }
  const imageUrl=await reference(profile);const backdrop=canonical==='intro'?'plain light gray':'solid hot pink';
  const prompt=`Photograph of the same adult person in image one. Preserve exactly their recognizable facial identity, hairstyle, facial hair, skin tone and body build. Preserve their eyeglasses from image one unless the requested costume explicitly specifies different eyewear; absence of glasses in the costume description does not mean remove them. Dress them in ${costume}. ${closeup?`Head and shoulders close up, centered, ${backdrop} background.`:'Full body from hat to shoe soles, shoes visible, centered, body occupies 85% of height, arms by sides, ample lateral space. Seamless perfectly uniform light gray #eeeeee background with no horizon, no shadow.'} Flat 1990s studio lighting. Low budget surreal desktop dance software. Neutral deadpan expression. Fully clothed. No text, no borders, no UI.`;
  let sources=[imageUrl];let finalPrompt=prompt;
  const referenceFile=path.join(media,'motion',`${canonical}.png`);
  if(canonical&&await exists(referenceFile)){
   const ref=await fal.storage.upload(new File([await fs.readFile(referenceFile)],'style-reference.png',{type:'image/png'}));
   sources=[imageUrl,ref];
   finalPrompt=`Generate a completely new coherent studio photograph of the adult person from IMAGE 1, recognizable by their facial features, hair and facial hair. IMAGE 2 is only a wardrobe, lighting, background and pose reference. Recreate its exact costume materials and accessories on the person from IMAGE 1: ${costume}. ${closeup?"Render a coherent head-and-shoulders portrait, face and neck and upper chest naturally together. Crop at the chest: no hands, waist, legs or shoes in frame.":"Render the person's entire face, neck, torso, arms, hands, legs and shoes naturally together."} Keep consistent lighting, focus, anatomy and proportions. ${closeup?`Head and shoulders portrait, ${backdrop} backdrop, framing like image 2.`:`Full body visible from head to shoes with margins, proportions and pose inspired by image 2, ${canonical==='oyster'?'flat pale butter-yellow backdrop glowing pale cyan in the upper-right corner, exactly matching image 2':'seamless very light gray backdrop'}.`} This is a new live-action video frame of the whole person. Do not paste a photographic head, do not retain the original actor body pixels, do not make a collage. Match the original low-budget late-1990s dance CD-ROM aesthetic, soft flat studio lighting, deadpan expression, slightly awkward posture. No UI or text.`;
  }
  if(canonical==='mozzarell-face')finalPrompt='Generate a new coherent photograph of the adult person from Image 1, recreating the exact upper-body framing, costume and pose of Image 2. Orange baseball cap, white tank top. Wide waist-up composition, shoulders and upper arms spread wide out to the sides, goofy smiling expression. Head only one third of image height, broad torso and arms filling width. Flat pale gray background. Entire person rendered naturally together, no pasted head or collage, no text, low-budget analog dance video.';
  let result:any;const reviews=[];
  for(let attempt=0;attempt<3;attempt++){
   result=await fal.subscribe('fal-ai/nano-banana-2/edit',{input:{prompt:finalPrompt,image_urls:sources,aspect_ratio:canonical==='mozzarell-face'?'16:9':canonical==='intro'?'9:16':closeup?'4:3':canonical?'auto':'9:16',resolution:'1K',output_format:'png'}});
   const assessment=await openai.chat.completions.create({model:'gpt-4.1-mini',temperature:0,response_format:{type:'json_object'},messages:[{role:'user',content:[{type:'text',text:`Compare identity consistency of two images without identifying anyone. Image 1 is the uploaded person, image 2 is their newly generated costume photograph. Requested outfit: ${costume}. Preserve visible eyeglasses unless the outfit explicitly substitutes other glasses, hair and facial hair, facial structure and general body build. Minor facial variation is acceptable. Do not reject expected changes in costume, pose, expression or framing. Return JSON {pass:boolean,missing_eyewear:boolean,major_identity_defect:boolean,corrections:string}. Only fail for missing visible eyewear (unless explicitly replaced) or a major identity defect such as missing facial hair or clearly different hair/person. Minor facial variation, portrait cropping, smile, lighting changes and hair hidden by a requested hat MUST pass. Do not require exact biometric similarity.`},{type:'image_url',image_url:{url:imageUrl}},{type:'image_url',image_url:{url:result.data.images[0].url}}]}]});
   const review=JSON.parse(assessment.choices[0].message.content||'{}');reviews.push(review);await fs.mkdir(path.join(root,'cache/identity-reviews'),{recursive:true});await fs.writeFile(path.join(root,'cache/identity-reviews',key+'.json'),JSON.stringify({profile,costume,canonical,reviews,lastImage:result.data.images[0].url},null,2));if(!review.missing_eyewear&&!review.major_identity_defect)break;
   if(attempt===2)throw Error('Identity frame did not retain the uploaded appearance. Try a clearer front-facing photograph.');
   finalPrompt+=' Correct these observed identity discrepancies while rendering the ENTIRE person coherently: '+String(review.corrections).slice(0,1200);
  }
  await saveRemote(result.data.images[0].url,local);await fs.writeFile(local+'.json',JSON.stringify({profile,canonical,identityReviews:reviews,imageRequestId:result.requestId},null,2));return result.data.images[0].url;
 })();frameLocks.set(key,promise);promise.catch(()=>frameLocks.delete(key));return promise;
}
async function generate(id:string,body:any){
 const job=jobs.get(id)!;job.started=Date.now();
 void logDiagnostic({event:'generation-start',jobId:id,character:body.character,variant:body.variant});
 if([...jobs.values()].filter(j=>j.status==='working'&&j.started).length>4){Object.assign(job,{status:'error',stage:'Busy',error:'The computer is busy with other sequences. Please try again shortly.'});void logDiagnostic({event:'generation-error',jobId:id,stage:'Busy',message:job.error});return;}
 try{
  if(body.profile!=='paul'||!body.canonical){await interactiveVideo(id,body,job,()=>reference(body.profile||'thomas'));return;}
  job.stage='Building identity';
  const character=String(body.character||'tayne');
  const costume=String(body.costume||costumes[character]||costumes.tayne).slice(0,700);
  const motion=String(body.motion||motions[character]||motions.tayne).slice(0,1200);
  const closeup=['hat','smile','face','intro'].includes(body.variant);
  const canonical=canonicalName(body);
  const imageUrl=await costumeFrame(body.profile||'thomas',costume,closeup,canonical);
  await saveRemote(imageUrl,path.join(media,'generated',`${id}.png`));job.image=`/media/generated/${id}.png`;
  job.stage='Rendering dance';
  const prompt=canonical==='mozzarell-face'?'Same complete adult person and clothing, wide waist-up framing. Small rhythmic upper-body bobs, arms loosely spread sideways, goofy smiling grin, orange cap on head. Head remains about one third of frame height. Flat pale gray studio background, fixed camera, retro analog dance video. No speech, no text, no other people.':body.variant==='intro'?`Locked static camera. Tight head-and-shoulders portrait filling a vertical frame, face large. Plain light gray studio background. ${motion} Natural live-action performance. Exactly one person. Speak the supplied sentence clearly, no other speech, no music. Maintain same costume and identity.`:`Locked static camera. ${closeup?'Head and shoulders close-up.':'Entire body always within frame, head and shoes visible, uniform light gray background.'} Same adult person and clothing as the image. Keep ALL eyeglasses, facial hair and hairstyle from the image in every frame. Never remove glasses or other accessories. ${motion} Awkward enthusiastic retro desktop dancer, deadpan expression. No cuts, no camera motion, no other people, no typography. Perform the requested movement visibly throughout all five seconds. No still-frame holds. ${/backward/i.test(motion)?'Make the backward travel clearly visible: begin at a three-quarter angle facing toward screen left, then alternate the feet in small sliding steps BACKWARDS toward screen right, translating the whole body about one fifth of the frame width. Keep the same facing direction and fixed camera. This is a backwards shuffle with actual rearward travel, not marching or swaying in place.':''} Audio: instrumental 1990s quirky electronic dance loop, bouncy synthetic bass, cheap MIDI brass and drum machine, 122 BPM, no singing, no speech.`;
  const motionFile=path.join(media,'motion',`${canonical}-5s.mp4`);
  const transfer=canonical&&await exists(motionFile);
  let model=transfer?(['celery','sway'].includes(canonical)?'minimax/h3-max/reference-to-video':'fal-ai/kling-video/v3/standard/motion-control'):'minimax/h3-max-turbo/image-to-video';
  let video:any;const progress={onEnqueue:(requestId:string)=>{job.requestId=requestId;},onQueueUpdate:(status:any)=>{job.providerStatus=status.status;}};
  if(body.variant==='intro'&&body.profile==='paul'){model='minimax/h3-max/reference-to-video';const dialogue=await fal.storage.upload(new File([await fs.readFile(path.join(media,'original/intro.wav'))],'dialogue.wav',{type:'audio/wav'}));video=await fal.subscribe(model,{...progress,input:{image_url:imageUrl,reference_audio_urls:[dialogue],prompt:`The man in the image introduces himself, accurately lip-synced to the exact speech in Audio 1. Preserve exactly its words, male voice, timbre, timing and audio. He says: Hey Paul. I'm Tayne, your latest dancer. I can't wait to entertain you. Tight closeup, locked camera, unchanged costume, face and gray background. Only the supplied voice, no music.`,duration:5,resolution:'480P',prompt_expansion_mode:'disabled'}});}
  else if(transfer){job.stage='Transferring choreography';const videoUrl=await fal.storage.upload(new File([await fs.readFile(motionFile)],'motion.mp4',{type:'video/mp4'}));const input=['celery','sway'].includes(canonical)?{prompt:motionPrompt(canonical),reference_image_urls:[imageUrl],reference_video_urls:[videoUrl],duration:5,resolution:'480P',aspect_ratio:'9:16',prompt_expansion_mode:'disabled'}:{image_url:imageUrl,video_url:videoUrl,character_orientation:'video',keep_original_sound:false,prompt:'The person from the supplied identity frame performs the exact reference choreography. Preserve face, costume, background, camera and timing. No new objects, no camera movement.'};video=await fal.subscribe(model,{...progress,input});}
  else video=await fal.subscribe(model,{...progress,input:{image_url:imageUrl,prompt,duration:5,resolution:'480P',prompt_expansion_mode:'disabled'}});
  const raw=path.join(root,'cache/generated',`${id}.mp4`);await fs.mkdir(path.dirname(raw),{recursive:true});await saveRemote(video.data.video.url,raw);
  let processing:any;const output=path.join(media,'generated',`${id}.mp4`);
  if(transfer){job.stage='Matching display and timing';processing=await finishChoreography(raw,motionFile,output,canonical);}else if(body.variant==='intro'&&body.profile==='paul'){await exec('ffmpeg',['-y','-i',raw,'-i',path.join(media,'original/intro.wav'),'-map','0:v:0','-map','1:a:0','-t','3.7','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',output,'-loglevel','error']);}else await fs.copyFile(raw,output);
  await fs.writeFile(path.join(media,'generated',`${id}.json`),JSON.stringify({profile:body.profile,character,variant:body.variant,costume,prompt,motion,model,processing,videoRequest:video.requestId,elapsedMs:Date.now()-job.started},null,2));
  if(body.variant==='smile'){await exec('ffmpeg',['-y','-i',path.join(media,'generated',`${id}.mp4`),'-ss','2','-frames:v','1',path.join(media,'generated',`${id}-print.png`),'-loglevel','error']);job.image=`/media/generated/${id}-print.png`;}
  Object.assign(job,{status:'complete',stage:'Ready',url:`/media/generated/${id}.mp4`,elapsed:Date.now()-job.started});
 }catch(e){const failedStage=job.stage;void logDiagnostic({event:'generation-error',jobId:id,stage:failedStage,message:e instanceof Error?e.message:'Generation failed',elapsedMs:Date.now()-job.started!});Object.assign(job,{status:'error',stage:'Generation failed',error:(e as any)?.body?JSON.stringify((e as any).body):e instanceof Error?(e.message||e.name):'Generation failed'});}
 finally{void logDiagnostic({event:'generation-settled',jobId:id,status:job.status,stage:job.stage,elapsedMs:Date.now()-job.started!,timings:job.timings});}
}
let voiceEmbedding:Promise<string>|undefined;
const voiceLocks=new Map<string,Promise<string>>();
const referenceText="Good morning Paul. What will your first sequence of the day be? I have a beta sequence I've been working on. Would you like to see it?";
async function embedding(){
 const p=path.join(root,'cache/computer-voice.safetensors');
 if(!await exists(p)){const audioUrl=await fal.storage.upload(new File([await fs.readFile(path.join(media,'original/voice-reference.wav'))],'computer.wav',{type:'audio/wav'}));const clone:any=await fal.subscribe('fal-ai/qwen-3-tts/clone-voice/1.7b',{input:{audio_url:audioUrl,reference_text:referenceText}});await saveRemote(clone.data.speaker_embedding.url,p);}
 return fal.storage.upload(new File([await fs.readFile(p)],'voice.safetensors',{type:'application/octet-stream'}));
}
async function qwenVoice(text:string){
 const id=hash('qwen-v1:'+text),p=path.join(media,'voice',`${id}.wav`);await fs.mkdir(path.dirname(p),{recursive:true});
 if(voiceLocks.has(id))return voiceLocks.get(id)!;
 const promise=(async()=>{
 if(!await exists(p)){
  voiceEmbedding??=embedding();
  const result:any=await fal.subscribe('fal-ai/qwen-3-tts/text-to-speech/1.7b',{input:{text,language:'English',speaker_voice_embedding_file_url:await voiceEmbedding,reference_text:referenceText,temperature:.3,max_new_tokens:Math.min(1600,Math.max(200,text.length*8))}});
  const raw=path.join(media,'voice',`${id}-raw.wav`);await saveRemote(result.data.audio.url,raw);
  await exec('ffmpeg',['-y','-i',raw,'-af','silenceremove=start_periods=1:start_duration=0.03:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB,areverse','-ar','24000','-c:a','pcm_s16le',p,'-loglevel','error']);await fs.unlink(raw);
 }
 return `/media/voice/${id}.wav`;
 })();voiceLocks.set(id,promise);promise.catch(()=>voiceLocks.delete(id));return promise;
}
async function voice(text:string,_style='computer'){return (await streamComputerVoice(text,()=>{})).url;}
export async function apiMiddleware(req:IncomingMessage,res:ServerResponse,next:()=>void){
  // Generated files must not depend on Vite's asynchronously updated public-file index.
  if(req.url?.startsWith('/media/')){
   try{
    const preview=/^\/media\/generated\/([a-f0-9]{20})\.mp4\?live=1$/.exec(req.url);
    const provider=preview&&videoPreviews.get(preview[1]);
    if(provider){
     const upstream=await fetch(provider,{method:req.method==='HEAD'?'HEAD':'GET',headers:req.headers.range?{Range:req.headers.range}:{}});
     res.statusCode=upstream.status;
     for(const header of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(header);if(value)res.setHeader(header,value);}
     res.setHeader('Cache-Control','private, max-age=3600');
     if(req.method==='HEAD'||!upstream.body){res.end();return;}
     const stream=Readable.fromWeb(upstream.body as any);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);return;
    }
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname.slice(7));
    const file=path.resolve(media,relative);
    if(!file.startsWith(media+path.sep))throw Error('Invalid media path');
    const stat=await fs.stat(file);if(!stat.isFile())throw Error('Not a file');
    const types:Record<string,string>={'.wav':'audio/wav','.mp3':'audio/mpeg','.mp4':'video/mp4','.png':'image/png','.jpg':'image/jpeg','.json':'application/json'};
    res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.setHeader('Accept-Ranges','bytes');res.setHeader('Cache-Control','private, max-age=3600');
    const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
    const start=range?Number(range[1]):0,end=range&&range[2]?Math.min(Number(range[2]),stat.size-1):stat.size-1;
    if(start>end||start>=stat.size){res.statusCode=416;res.setHeader('Content-Range',`bytes */${stat.size}`);res.end();return;}
    if(range){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${stat.size}`);}
    res.setHeader('Content-Length',end-start+1);if(req.method==='HEAD'){res.end();return;}
    const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());stream.pipe(res);return;
   }catch{res.statusCode=404;res.end('Media not found');return;}
  }
  if(!req.url?.startsWith('/api/'))return next();
  res.setHeader('Content-Type','application/json');
  try{
   const allowedOrigins=(process.env.APP_ORIGINS||'http://localhost:5173,http://127.0.0.1:5173').split(',');
   if(req.headers.origin&&!allowedOrigins.includes(req.headers.origin)){res.statusCode=403;res.end(JSON.stringify({error:'Origin not allowed'}));return;}
   let raw=Buffer.alloc(0);for await(const chunk of req){raw=Buffer.concat([raw,chunk]);if(raw.length>16e6)throw Error('Request too large');}
   const b=raw.length?JSON.parse(raw.toString()):{};let result:any;
   if(b.profile!==undefined&&(typeof b.profile!=='string'||!/^(paul|thomas|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(b.profile)))throw Error('Invalid profile');
   if(req.url==='/api/generate'&&(typeof b.character!=='string'||!/^[-\w .]{1,80}$/.test(b.character)||!['base','face','engaged','hat','flarhgunnstow','intro','sway','smile'].includes(b.variant)))throw Error('Invalid sequence');
   if(req.url==='/api/health')result={ok:true,providers:{openai:!!process.env.OPENAI_API_KEY,fal:!!process.env.FAL_KEY}};
   else if(req.url==='/api/client-event'){
    if(!['generation-ready','generation-error','generation-cancelled'].includes(b.event))throw Error('Invalid diagnostic event');
    await logDiagnostic({event:'client-'+b.event,jobId:/^[a-f0-9]{20}$/.test(b.jobId)?b.jobId:undefined,character:String(b.character||'').slice(0,80),variant:String(b.variant||'').slice(0,30),message:String(b.message||'').slice(0,500),elapsedMs:Number(b.elapsedMs)||0});result={ok:true};
   }
   else if(req.url==='/api/warm'){
    void reference(String(b.profile||'paul')).catch(()=>{});
    void computerVoiceId().catch(()=>{});
    result={ok:true};
   }else if(req.url==='/api/command'){
    const text=String(b.text||'').slice(0,2000),context=b.context as Context;
    result=scripted(text,context);
    if(!result){
     const playbackRate=/twice as slow|half[ -]?speed|50%.*speed/i.test(text)?.5:/twice as fast|double[ -]?speed/i.test(text)?2:1;
     const keepEyewear=(costume:string)=>!/(sun[ -]?glasses|shades)/i.test(text+' '+(context.costume||''))?costume.replace(/(?:black |dark |tinted )?(?:sun[ -]?glasses|shades)/gi,'the same eyewear as the identity photo, if any'):costume;
     const planningStarted=performance.now();let earlyJob:string|undefined;let plannedBody:any;let earlyStart:Promise<void>|undefined;
     const response=await openai.chat.completions.create({stream:true,model:'gpt-4.1-mini',temperature:.7,response_format:commandPlanFormat(text),messages:[{role:'system',content:`You are the terse, literal, absurd Cinco computer from Celery Man. Interpret commands for a personalized desktop dancer. Output JSON in this exact field order: {action,costume,motion,label,response}. action must be custom for ALL requested new or modified dance performances. Other allowed actions are engage, print, beta, pause, resume, chaos, reaction. Use reaction with empty response for commentary or acknowledgment that does not ask for a new performance. Never map a novel shuffle or new costume to an existing canonical dancer action. Known exact actions only when relevant; new requests use custom. For custom: response is a short deadpan computer acknowledgement of at most eight words, label is a bizarre uppercase dancer name under 18 characters, Generate a five-second looping performance, never specify a different duration. For a slow hat wobble, require exactly ONE tilt and return during the entire five-second clip (two seconds out, two seconds back, one second hold); never fit extra cycles into five seconds. For a shoulder shimmy insist on visibly exaggerated alternating shoulder lifts and drops with torso rocking, not a barely visible standing pose. Never add sunglasses unless the user explicitly requests them or they are already in the current outfit. motion describes 35-55 words of concrete physical choreography, limb actions and timing that precisely follow every requested modifier; for a tiny backward shuffle orient the performer three-quarters toward screen left and alternate sliding the feet backward toward screen right, visibly moving the whole body a short distance across the studio floor, keep arms loosely bent; for a hat wobble the hat itself tilts on the head rather than only moving the torso, costume describes the COMPLETE fully clothed outfit, explicitly restating retained clothing from context, never saying unchanged or same outfit. Preserve current character outfit unless change requested. Never invent a request to remove eyeglasses or say no accessories; preserve the uploaded person's eyewear unless the user explicitly requests changing it. Never produce actual nudity; the NSFW gag uses a fully clothed dancer and error modal. No questions for ordinary commands. Context: ${JSON.stringify(context)}`},{role:'user',content:text}]});
     let json='';
     for await(const chunk of response){
      json+=chunk.choices[0]?.delta?.content||'';
      // Start when the two visual fields are complete; labels/response finish
      // in parallel. Do not render from contradictory old/new outfit text.
      const field=(name:string)=>{const match=new RegExp('"'+name+'"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")').exec(json);return match?JSON.parse(match[1]):undefined;};
      const outfit=field('costume'),motion=field('motion');
      if(!earlyStart&&/"action"\s*:\s*"custom"/.test(json)&&outfit&&motion&&typeof b.profile==='string'){
       plannedBody={profile:b.profile,canonical:false,character:'custom',variant:'base',costume:keepEyewear(outfit),motion,playbackRate};
       earlyJob=generationKey(plannedBody);
       const id=earlyJob;
       earlyStart=(async()=>{await fs.mkdir(path.join(media,'generated'),{recursive:true});
        if(await exists(path.join(media,'generated',`${id}.mp4`)))jobs.set(id,{status:'complete',stage:'Ready',url:`/media/generated/${id}.mp4`,image:`/media/generated/${id}.png`});
        else if(!jobs.has(id)||jobs.get(id)?.status==='error'){jobs.set(id,{status:'working',stage:'Rendering dance'});void generate(id,plannedBody);}
       })();
      }
     }
     result=validateCommandPlan(JSON.parse(json||'{}'),text);if(typeof result.costume==='string')result.costume=keepEyewear(result.costume);
     if(earlyStart){await earlyStart;result.generationId=earlyJob;plannedBody.character=result.label||'custom';}
     result.playbackRate=playbackRate;result.planningMs=performance.now()-planningStarted;
     const allowed=['reaction','custom','hat','flarhgunnstow','engage','print','beta','pause','resume','chaos','celery','oyster','tayne'];
     if(!allowed.includes(result.action)||typeof result.response!=='string')throw Error('Invalid command response');
     if(result.motion&&result.costume&&['hat','flarhgunnstow','celery','oyster','tayne'].includes(result.action))result.action='custom';
     // The sketch acknowledges new moves with a terse recorded Okay while the terminal names the move.
     if(result.action==='custom')result.audio='okay';
     result.provider='gpt-4.1-mini';
    }else result.provider='reference-protocol';
    await logDiagnostic({event:'command',text,character:context.character,action:result.action,label:result.label,generationId:result.generationId,planningMs:result.planningMs,provider:result.provider});
   }else if(req.url==='/api/transcribe/session'){
    res.setHeader('Cache-Control','no-store');
    if(req.method!=='POST'){res.statusCode=405;res.end(JSON.stringify({error:'POST required'}));return;}
    result=await transcriptionSession(openai);
   }else if(req.url==='/api/transcribe'){
    const bytes=Buffer.from(String(b.audio||''),'base64');
    const requestId=String(b.requestId||randomUUID());
    result={...await transcribeAudio(openai,bytes,b.mime||'audio/webm'),requestId};
   }else if(req.url==='/api/voice/stream'){
    const text=String(b.text||'').trim().slice(0,600);if(!text)throw Error('Speech text is required');
    const controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});
    res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store');res.flushHeaders();
    const send=(data:unknown)=>{if(!res.destroyed)res.write(JSON.stringify(data)+'\n');};
    const summary=await streamComputerVoice(text,chunk=>send({type:'pcm',data:chunk.toString('base64')}),controller.signal);
    send({type:'done',...summary});res.end();return;
   }else if(req.url==='/api/voice')result={url:await voice(String(b.text||'').slice(0,600),b.style==='phone'?'phone':'computer')};
   else if(req.url==='/api/generate'){
    const id=generationKey(b);
    await fs.mkdir(path.join(media,'generated'),{recursive:true});
    const saved=await savedGeneration(media,id);
    if(saved)jobs.set(id,saved);
    else if(!jobs.has(id)||jobs.get(id)?.status==='error'){jobs.set(id,{status:'working',stage:'Queued'});void generate(id,b);}
    result={id,...jobs.get(id)};
   }else if(req.url.startsWith('/api/job/')){
    const id=req.url.split('/').pop()!,active=jobs.get(id);
    // Active jobs already have authoritative state. A cloud-storage stat on
    // every 120ms poll adds latency precisely while generation is in progress.
    if(active)result={id,...active};
    else {const saved=await savedGeneration(media,id);result={id,...(saved||{status:'error',error:'Unknown job'})};}
   }
   else if(req.url==='/api/profile'){
    const id=randomUUID();await fs.mkdir(path.join(media,'profiles'),{recursive:true});await fs.writeFile(path.join(media,'profiles',`${id}.jpg`),Buffer.from(b.image,'base64'));void reference(id).catch(()=>{});result={id};
   }else {res.statusCode=404;result={error:'Unknown endpoint'};}
   res.end(JSON.stringify(result));
  }catch(e){const rawError=e instanceof Error?e.message:'Request failed';void logDiagnostic({event:'request-error',route:req.url?.split('?')[0],message:rawError});const error=/no credits|insufficient_quota|exceeded your current quota/i.test(rawError)?'OpenAI credits exhausted. Voice transcription and new command interpretation are unavailable.':rawError;if(res.destroyed)return;if(res.headersSent){res.end(JSON.stringify({type:'error',error})+'\n');}else{res.statusCode=500;res.end(JSON.stringify({error}));}}
}
export function apiPlugin():Plugin{return {name:'cinco-local-api',configureServer(server){server.middlewares.use(apiMiddleware);}};}
