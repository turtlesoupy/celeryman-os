import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);

export function canonicalName(body:any):string {
  return body.canonical ? body.variant==='base' ? body.character : body.variant==='face' ? body.character+'-face' : body.variant : '';
}
export const motionNames=['celery','oyster','tayne','hat','engaged','flarhgunnstow','sway'];
export function generationKey(b:any){
  const improved=motionNames.includes(canonicalName(b));
  return createHash('sha256').update(JSON.stringify({version:improved?6:b.canonical?4:9,revision:improved?(canonicalName(b)==='sway'?4:canonicalName(b)==='engaged'?3:b.profile!=='paul'&&canonicalName(b)==='oyster'?4:2):canonicalName(b)==='mozzarell-face'?4:b.profile!=='paul'&&b.variant==='face'&&['celery','oyster'].includes(b.character)?5:b.variant==='intro'&&b.profile==='paul'?4:b.variant==='face'||b.variant==='hat'||b.variant==='smile'?3:b.character==='celery'||b.character==='oyster'?2:0,canonical:b.canonical,profile:b.profile,character:b.character,variant:b.variant,motion:b.motion,costume:b.costume,nonce:b.nonce,playbackRate:b.playbackRate})).digest('hex').slice(0,20);
}

// These operations transform complete generated frames. There is no actor/face compositing.
export async function finishChoreography(raw:string,reference:string,output:string,name:string){
  const normalized=raw+'.5s.mp4';
  await exec('ffmpeg',['-y','-stream_loop','-1','-i',raw,'-t','5','-an','-c:v','libx264','-crf','17',normalized,'-loglevel','error']);
  let source=normalized;
  if(['oyster','hat','flarhgunnstow'].includes(name)){
    source=raw+'.retimed.mp4';
    await exec('python3',['scripts/retime-dance.py',reference,normalized,source]);
  }
  const temporary=output+'.processing.mp4';
  await exec('python3',['scripts/finish-video.py',source,reference,temporary]);
  const framing=JSON.parse(await fs.readFile(temporary+'.json','utf8'));
  const timing=source!==normalized?JSON.parse(await fs.readFile(source+'.json','utf8')):undefined;
  await fs.rename(temporary,output);
  await Promise.all([temporary+'.raw.mp4',temporary+'.json',source!==normalized?source:undefined,source!==normalized?source+'.raw.mp4':undefined,source!==normalized?source+'.json':undefined,normalized].filter(Boolean).map(f=>fs.rm(f!,{force:true})));
  return {pipeline:'whole-frame-finish-v2',framing,timing};
}

export function motionPrompt(name:string){
  return `Regenerate the COMPLETE performer, from hair to shoes, as the adult person depicted in Image 1, dancing the exact choreography from Video 1. The reference movie is the precise motion and style guide: copy every step, torso angle, hand position, facial expression, timing, and the original soft video texture. The new person's body, face, neck, hands, costume and limbs must be rendered together as one physically coherent live-action person. Do not paste or replace only a head. Preserve the reference framing, camera, light and background. ${name==='sway'?'ALWAYS wear the black fedora hat and black sunglasses from Image 1 in EVERY frame, unchanged. Preserve exactly the gold-and-black shirt, black leather pants and black boots. Never remove any clothing or accessories. ':''}${name==='celery'?'Hands on hips, shuffle and sway from side to side, head tilted slightly, suit sleeves rolled up, loose shiny charcoal trousers.':''} No new movements, no camera motion, no modern cinematic polishing. Same five second choreography as the input.`;
}
