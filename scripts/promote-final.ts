import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {generationKey,finishChoreography} from '../server/choreography';
import {costumes,motions} from '../src/dances';
const prior=JSON.parse(await fs.readFile('benchmarks/reviewed-assets.json','utf8'));
const manifest=[];
for(const row of prior){
 const id=generationKey(row);const output=`public/media/generated/${id}.mp4`;
 const processing=await finishChoreography(row.sourceGeneratedVideo,`public/media/motion/${row.name}-5s.mp4`,output,row.name);
 await fs.copyFile(`public/media/generated/${row.id}.png`,`public/media/generated/${id}.png`);
 const meta={...row,id,processing};await fs.writeFile(`public/media/generated/${id}.json`,JSON.stringify(meta,null,2));manifest.push(meta);console.log(row.name,id);
}
for(const variant of ['flarhgunnstow','intro']){
 const body={profile:'paul',character:'tayne',variant,canonical:true,costume:costumes.tayne,motion:variant==='intro'?`Tight head-and-shoulders close up. Face fills most of the vertical frame, head and upper chest only. Light gray background. Look at camera and say in a warm natural American male voice: Hey Paul. I'm Tayne, your latest dancer. I can't wait to entertain you. Keep the same clothing, face, and fixed camera.`:motions[variant]};
 const id=generationKey(body),output=`public/media/generated/${id}.mp4`;
 if(variant==='intro')execFileSync('ffmpeg',['-y','-i','analysis/intro-reference.mp4','-i','public/media/original/intro.wav','-map','0:v:0','-map','1:a:0','-t','3.7','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',output,'-loglevel','error']);
 else await fs.copyFile('analysis/flar-corrected-retimed.mp4',output);
 await fs.copyFile(variant==='intro'?'public/media/generated/b86d56962d2cf183a228.png':'analysis/flar-keyframe-corrected.png',`public/media/generated/${id}.png`);
 const provenance=JSON.parse(await fs.readFile(`analysis/${variant==='intro'?'intro-reference':'flar-corrected'}.json`,'utf8'));
 const meta={...body,provenance,sourceGeneratedVideo:variant==='intro'?'analysis/intro-reference.mp4':'analysis/flar-corrected.mp4',reviewedPromotion:true};await fs.writeFile(`public/media/generated/${id}.json`,JSON.stringify(meta,null,2));manifest.push({id,...meta});console.log(variant,id);
}
await fs.writeFile('benchmarks/final-assets.json',JSON.stringify(manifest,null,2));
