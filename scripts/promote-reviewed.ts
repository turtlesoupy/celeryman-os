import fs from 'node:fs/promises';
import {generationKey,canonicalName,finishChoreography} from '../server/choreography';
const prepared=JSON.parse(await fs.readFile('benchmarks/prepared-assets.json','utf8'));
const manifest=[];
for(const old of prepared){
 const name=canonicalName(old.body);if(!['celery','oyster','tayne','hat','engaged'].includes(name))continue;
 const id=generationKey(old.body),raw=name==='celery'?'analysis/celery-h3.mp4':`public/media/generated/${old.id}.mp4`;
 const output=`public/media/generated/${id}.mp4`;
 const processing=await finishChoreography(raw,`public/media/motion/${name}-5s.mp4`,output,name);
 await fs.copyFile(`public/media/generated/${old.id}.png`,`public/media/generated/${id}.png`);
 const prior=JSON.parse(await fs.readFile(name==='celery'?'analysis/celery-h3.json':`public/media/generated/${old.id}.json`,'utf8'));
 const meta={...old.body,model:prior.model,videoRequest:prior.requestId||prior.videoRequest,processing,sourceGeneratedVideo:raw,reviewedPromotion:true};
 await fs.writeFile(`public/media/generated/${id}.json`,JSON.stringify(meta,null,2));manifest.push({id,name,...meta});console.log(name,id);
}
await fs.writeFile('benchmarks/reviewed-assets.json',JSON.stringify(manifest,null,2));
