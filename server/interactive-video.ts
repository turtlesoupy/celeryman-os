import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fal} from '@fal-ai/client';
import {videoPreviews,VideoDownload} from './video-preview.ts';
import {costumeFrameInput,costumeFrameKey,costumeFrameVariant} from './costume-frame.ts';
import {canonicalName,motionPrompt} from './choreography.ts';
import {usesTextOnlyDance,textMotionPrompt} from './text-motion.ts';
const exec=promisify(execFile);
const motionReferences=new Map<string,Promise<string>>();
function motionReference(file:string){let pending=motionReferences.get(file);if(!pending){pending=fs.readFile(file).then(bytes=>fal.storage.upload(new File([bytes],'motion.mp4',{type:'video/mp4'})));motionReferences.set(file,pending);pending.catch(()=>motionReferences.delete(file));}return pending;}
type CostumeFrame={url:string;file:string;requestId?:string;saved?:Promise<void>;timings?:Record<string,number>};
const costumeFrames=new Map<string,Promise<CostumeFrame>>();
// Actor-bearing wardrobe images overwhelmed some uploaded identities. Use only
// the uploaded person here; the costume text describes clothing independently.
// Klein also changed faces in the single-reference regression, so use Nano Banana.
function identityCostumeFrame(profile:string,costume:string,closeup:boolean,ref:string,canonical:string,smiling=false){
 canonical=costumeFrameVariant(canonical);
 const key=costumeFrameKey(profile,costume,closeup,canonical,smiling);
 const old=costumeFrames.get(key);if(old)return old.then(frame=>({...frame,timings:{frameReused:1}}));
 const pending=(async()=>{
  const file=path.join(process.cwd(),'public/media/generated',`identity-frame-${key}.png`);
  if(await fs.access(file).then(()=>true,()=>false))return {file,url:smiling?'':await fal.storage.upload(new File([await fs.readFile(file)],'costume.png',{type:'image/png'})),timings:{frameCacheHit:1}};
  const started=performance.now();
  const result:any=await fal.run('fal-ai/nano-banana-2/edit',{input:costumeFrameInput(ref,costume,closeup,canonical,smiling)});
  const timings:Record<string,number>={frameCacheHit:0,frameRequestMs:performance.now()-started};
  if(typeof result.data.timings?.inference==='number')timings.frameInferenceMs=result.data.timings.inference*1000;
  // The video provider can use its own image URL immediately. Persisting our
  // copy must not hold up inference (especially on the production GCS mount).
  const saved=(async()=>{const began=performance.now();const response=await fetch(result.data.images[0].url);if(!response.ok)throw Error('Costume frame download failed');const bytes=Buffer.from(await response.arrayBuffer());timings.frameDownloadMs=performance.now()-began;const saveAt=performance.now();await fs.writeFile(file+'.partial',bytes);await fs.rename(file+'.partial',file);timings.frameSaveMs=performance.now()-saveAt;})();
  void saved.catch(()=>costumeFrames.delete(key));
  return {file,url:result.data.images[0].url,requestId:result.requestId,saved,timings};
 })();costumeFrames.set(key,pending);pending.catch(()=>costumeFrames.delete(key));return pending;
}
export async function interactiveVideo(id:string,body:any,job:any,identity:()=>Promise<string>){
 const start=performance.now(),timings:Record<string,number>={};
 job.stage='Rendering dance';job.started=Date.now();job.timings=timings;
 const canonical=canonicalName(body),motionFile=path.join(process.cwd(),'public/media/motion',canonical+'-5s.mp4');
 const directDance=usesTextOnlyDance(body);
 const transfer=!directDance&&!!canonical&&await fs.access(motionFile).then(()=>true,()=>false);
 const needsFrame=!directDance&&(body.variant==='smile'||transfer||(body.canonical&&body.variant==='face'&&['celery','oyster'].includes(body.character)));
 // Motion upload is independent of costume synthesis. Handle rejection now so
 // it cannot become unhandled while the identity/image request is in flight.
 const motionPending=(transfer?motionReference(motionFile):Promise.resolve(undefined)).then(url=>{timings.motionReferenceMs=performance.now()-start;return {url};},error=>({error}));
 const ref=await identity();timings.identityMs=performance.now()-start;
 const hatWobble=/hat.*wobble|wobble.*hat/i.test(body.motion);
 const effectiveMotion=hatWobble&&body.playbackRate!==undefined&&body.playbackRate!==1?'Hat wobble: keep torso and head mostly upright and still while the hat itself rocks smoothly side to side on the head, then returns to level. Arms relaxed at sides. A regular rhythm with a clearly visible tilt of the actual hat.':body.motion;
 const closeup=['face','smile','hat','intro'].includes(body.variant);
 let prompt=`Image 1 is the identity reference for the adult performer. Generate the SAME recognizable person, preserving facial features, hair, body build and the presence or absence of facial hair and eyeglasses. Never invent a different performer based on the dance name. Render a coherent live-action performance with natural anatomy. No pasted head, collage or cutout. Dress the person in this complete outfit: ${String(body.costume).slice(0,900)}. ${closeup?'Head-and-shoulders portrait, head and upper chest fully visible with margins.':'Full body always visible including shoes, generous margins above head and below feet, performer occupies 80% of frame height.'} ${body.variant==='face'?'Solid hot pink background, edge to edge, no yellow or gray border.':'Seamless uniform very light gray studio backdrop, no floor line, no scenery.'} Locked static camera. Flat late-1990s low-budget desktop dance footage with soft analog texture, deadpan expression. No cuts, text, UI, or other people. Choreography: ${String(effectiveMotion).slice(0,1600)}. ${/backward/i.test(body.motion)?'Begin facing three-quarters toward screen left and take visibly backward sliding steps toward screen right with actual whole-body travel, not stepping in place.':''} ${/hat.*wobble|wobble.*hat/i.test(body.motion)?'The HAT ITSELF visibly rocks and tilts on the head; the head and torso remain mostly upright. '+(body.playbackRate===undefined&&/slow|half.*speed/i.test(body.motion)?'Exactly ONE slow tilt-and-return during the ENTIRE five seconds: gradually tilt the HAT to one side from second 0 to 2, return level from second 2 to 4, then hold level to second 5. This hat timing overrides any repeated cycles in the motion description. No quick bobbing or shuddering.':''):''} ${/shimmy/i.test(body.motion)?'Make the shoulder shimmy LARGE and unmistakable: raise the left shoulder toward the ear while dropping the right shoulder, then visibly reverse, continuously alternating with a strong rhythmic chest twist. Never just stand and shift feet.':''} Start moving immediately. Repeat a rhythmic five-second cycle, end in the starting pose without stopping or fading. Audio: continuous instrumental 1990s quirky MIDI dance groove, synthetic bass, cheap brass and drum machine at 122 BPM. No speech, no singing, no fade-out, no outro.`;
 if(transfer)prompt=motionPrompt(canonical)+` The same person from Image 1 wears this complete outfit: ${body.costume}. Video 1 supplies ONLY choreography, timing and camera framing, never the identity, face, hair or body build of its actor. Image 1 supplies the complete performer and costume. Preserve that person throughout; do not turn them into the actor in the motion reference. Exactly one dancer, entirely in frame.`;
 if(directDance&&body.canonical&&!['hat','intro','smile'].includes(body.variant))prompt=textMotionPrompt(String(body.costume).slice(0,900),String(effectiveMotion).slice(0,1600),body.variant==='face');
 if(canonical==='mozzarell-face')prompt=`Image 1 is the identity of the performer. Preserve the face, hair, facial hair and eyewear. Dress in ${body.costume}. Wide waist-up framing with shoulders and upper arms loosely spread sideways; head occupies only one third of frame height. Goofy grin and small rhythmic upper-body bobs. Uniform pale gray backdrop, locked camera, low-budget analog dance footage. No speech, cuts, text or other people.`;
 if(body.variant==='intro')prompt=`Image 1 is the recognizable adult performer. Dress in ${body.costume}. Tight head-and-shoulders portrait, flat gray studio, locked camera, 1990s analog video. ${body.motion} Speak exactly the requested sentence in a natural warm American voice. No other words, no music, no singing.`;
 if(directDance&&body.variant==='smile')prompt=`Image 1 supplies only the identity of the adult performer. Preserve their recognizable face, hair, facial hair and eyewear unless the outfit explicitly replaces it. Ignore the reference clothing, pose and scenery. Dress in ${String(body.costume).slice(0,900)}. Tight head-and-shoulders studio portrait, full head and hat visible, shoulders and upper chest in frame. Look at the camera and hold a broad closed-mouth smile from the very first frame through the entire clip. Uniform pale gray empty background. Locked camera. Exactly one person. No props, background figures, text, cuts, speech or music.`;
 let costumeFrame:CostumeFrame|undefined;
 if(needsFrame){job.stage='Preparing costume';costumeFrame=await identityCostumeFrame(body.profile,body.costume,closeup,ref,body.variant==='smile'?body.character:canonical,body.variant==='smile');timings.frameMs=performance.now()-start-timings.identityMs;job.stage='Rendering dance';}
 if(body.variant==='smile'&&costumeFrame){
  // Printing consumes only a still. The image model already made the smiling
  // portrait; animating it and extracting a frame wastes a full video request.
  job.stage='Preparing printout';
  const saveAt=performance.now();await costumeFrame.saved;
  const dir=path.join(process.cwd(),'public/media/generated'),image=path.join(dir,id+'-print.png');
  await fs.copyFile(costumeFrame.file,image+'.partial');await fs.rename(image+'.partial',image);
  Object.assign(timings,costumeFrame.timings);timings.persistMs=performance.now()-saveAt;timings.totalMs=performance.now()-start;
  await fs.writeFile(path.join(dir,id+'.json'),JSON.stringify({profile:body.profile,character:body.character,variant:body.variant,costume:body.costume,model:'fal-ai/nano-banana-2/edit',imageRequest:costumeFrame.requestId,timings,elapsedMs:timings.totalMs,pipeline:'smiling-portrait-still-v1',outputKind:'image'},null,2));
  const url=`/media/generated/${id}-print.png`;
  Object.assign(job,{status:'complete',stage:'Ready',url,image:url,elapsed:timings.totalMs});return;
 }
 if(costumeFrame&&!['face','smile'].includes(body.variant))prompt+=' Image 2 is the original photo of the same person in Image 1. Preserve their recognizable appearance from both images. Only Image 1 supplies the costume; do not copy the original photo clothing or scenery.';
 if(body.variant==='face'&&!directDance)prompt+=' Preserve the tight head-and-shoulders composition of Image 1 throughout. Hat at the top edge, upper chest at bottom edge. Never zoom out or show legs or feet. Solid hot pink backdrop.';
 const anchoredPortrait=['face','smile'].includes(body.variant)&&!!costumeFrame;
 const model=anchoredPortrait?'minimax/h3-max-turbo/image-to-video':'minimax/h3-max/reference-to-video';
 if(anchoredPortrait)prompt='Animate this exact head-and-shoulders portrait. Keep the camera fixed at this exact close-up scale, with the same face, clothing and accessories. Preserve the presence or absence of eyeglasses and headwear exactly. Tiny rhythmic head bobs and glances, subtle awkward smile. Solid hot pink background. No zoom, no cuts, no speech. Keep the upper chest at the bottom edge; do not show the waist, legs or feet. End in the initial pose for a seamless loop.';
 const motionWaitAt=performance.now(),motionResult=await motionPending;
 if('error' in motionResult)throw motionResult.error;
 const motionRef=motionResult.url;timings.motionWaitMs=performance.now()-motionWaitAt;
 // Synchronous inference avoids the hosted queue's poll/delivery round trips.
 const videoStarted=performance.now();
 const video:any=await fal.run(model,{input:{...(anchoredPortrait?{image_url:costumeFrame!.url}:{reference_image_urls:costumeFrame?[costumeFrame.url,ref]:[ref],...(canonical==='oyster'&&costumeFrame?{image_url:costumeFrame.url}:{})}),...(motionRef?{reference_video_urls:[motionRef]}:{}),prompt,duration:5,resolution:'480P',aspect_ratio:canonical==='mozzarell-face'?'16:9':canonical==='oyster'?'4:3':body.variant==='intro'?'9:16':closeup?'4:3':'9:16',prompt_expansion_mode:'disabled'}});
 timings.videoMs=performance.now()-videoStarted;
 timings.previewMs=performance.now()-start;
 const downloadStarted=performance.now(),download=new VideoDownload(video.data.video.url);
 videoPreviews.set(id,download);
 // The browser can stream the genuine completed model output immediately,
 // while the local cache and poster are written independently below.
 Object.assign(job,{previewUrl:`/media/generated/${id}.mp4?live=1`,url:`/media/generated/${id}.mp4`});
 job.stage='Loading sequence';
 const dir=path.join(process.cwd(),'public/media/generated'),output=path.join(dir,id+'.mp4');
 // FFmpeg seeks and rewrites headers. Do that on local scratch, not a cloud
 // object-storage mount; persist only the finished artifacts.
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'cinco-video-'));
 try{
 const temp=path.join(scratch,'video.mp4');
 await fs.writeFile(temp,await download.completed);
 timings.downloadMs=performance.now()-downloadStarted;
 // Extract a real generated frame, never a composited photo, for the poster/print queue.
 let processing:any;
 const finishStarted=performance.now();
 if(transfer){job.stage='Finishing sequence';const finished=path.join(scratch,'finished.mp4');await exec('ffmpeg',['-y','-i',temp,'-t','5','-vf','scale=-2:360,gblur=sigma=0.3,fps=30000/1001','-an','-c:v','libx264','-preset','veryfast','-crf','18','-movflags','+faststart',finished,'-loglevel','error']);await fs.rename(finished,temp);processing={pipeline:'whole-frame-soft-video',note:'No segmentation, recoloring or body-dependent crop.'};}
 const image=path.join(dir,id+'.png');
 const poster=path.join(scratch,'poster.png');
 // A generated smile can establish its portrait framing during the clip.
 // Print its final pose rather than the opening transition frame.
 await exec('ffmpeg',['-y',...(body.variant==='smile'?['-sseof','-0.1']:['-ss','0']),'-i',temp,'-frames:v','1',poster,'-loglevel','error']);
 timings.ffmpegMs=performance.now()-finishStarted;
 const saveStarted=performance.now();
 await Promise.all([fs.copyFile(temp,output+'.partial'),fs.copyFile(poster,image+'.partial'),costumeFrame?.saved,transfer?fs.writeFile(path.join(dir,id+'-preview.mp4.partial'),await download.completed):undefined]);
 await Promise.all([fs.rename(output+'.partial',output),fs.rename(image+'.partial',image),transfer?fs.rename(path.join(dir,id+'-preview.mp4.partial'),path.join(dir,id+'-preview.mp4')):undefined]);
 timings.persistMs=performance.now()-saveStarted;
 Object.assign(timings,costumeFrame?.timings);
 timings.totalMs=performance.now()-start;timings.finishMs=timings.totalMs-timings.previewMs-timings.downloadMs;
 const metadata={profile:body.profile,character:body.character,variant:body.variant,costume:body.costume,motion:body.motion,playbackRate:body.playbackRate,prompt,model,videoRequest:video.requestId,providerTimings:video.data.timings,timings,elapsedMs:timings.totalMs,processing,costumeFrame:costumeFrame?{model:'fal-ai/nano-banana-2/edit',requestId:costumeFrame.requestId}:undefined,pipeline:directDance?'identity-photo-text-v1':'identity-only-costume-v2'};
 await fs.writeFile(path.join(dir,id+'.json'),JSON.stringify(metadata,null,2));
 Object.assign(job,{status:'complete',stage:'Ready',url:`/media/generated/${id}.mp4`,image:`/media/generated/${path.basename(image)}`,elapsed:timings.totalMs});
 }finally{videoPreviews.delete(id);await fs.rm(scratch,{recursive:true,force:true});}
}
