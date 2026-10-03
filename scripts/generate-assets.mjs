import 'dotenv/config';
import {fal} from '@fal-ai/client';
import fs from 'node:fs/promises';
fal.config({credentials:process.env.FAL_KEY});
const dir='public/media/generated'; await fs.mkdir(dir,{recursive:true});
const identity=await fal.storage.upload(new File([await fs.readFile('reference/thomas-dimson.jpg')],'thomas.jpg',{type:'image/jpeg'}));
const costumes={celery:'shiny charcoal oversized suit, white open collar shirt, black dress shoes',oyster:'red backwards baseball cap, red athletic jersey, blue shorts, black sneakers',tayne:'black fedora, black sunglasses, open gold and black baroque patterned silk shirt, gold chain, black leather pants, black boots'};
await Promise.allSettled(Object.entries(costumes).map(async([name,costume])=>{
 const prompt=`Create a full body front view of the adult man from reference image, preserve his recognizable facial identity, hair and beard. He wears ${costume}. Awkward exuberant 1990s dance CD-ROM character. Full body head to shoes, centered, plenty of white margin around body and arms, seamless uniform light gray #eeeeee background, no shadows, flat studio lighting. Camera locked straight on. Real photographed human, not an illustration. No text, no windows, no UI. Portrait 9:16.`;
 console.log('image start',name);
 const img=await fal.subscribe('fal-ai/nano-banana-2/edit',{input:{prompt,image_urls:[identity],aspect_ratio:'9:16',resolution:'1K',output_format:'png'}});
 await fs.writeFile(`${dir}/thomas-${name}.png`,Buffer.from(await(await fetch(img.data.images[0].url)).arrayBuffer()));
 const motion=name==='celery'?'jaunty side to side stepping, swaying hips, loose elbows, alternating finger pointing, goofy confident business dance':name==='oyster'?'energetic goofy athletic hopping dance, elbows out, knees bent, quick sideways steps, grin toward camera':'absurd confident disco dance, deep wide knee bends, hip thrusts, alternating pointing arms, hat stays on, boots step side to side';
 console.log('video start',name);
 const vid=await fal.subscribe('fal-ai/minimax/hailuo-2.3-fast/standard/image-to-video',{input:{image_url:img.data.images[0].url,prompt:`Locked-off full body camera, no cuts or zoom. The same man performs ${motion}. Keep entire body inside frame with white margins. Seamless flat light gray background. Maintain face and clothing. Looped retro CD-ROM dance performance.`,duration:'6',prompt_optimizer:false}});
 await fs.writeFile(`${dir}/thomas-${name}.mp4`,Buffer.from(await(await fetch(vid.data.video.url)).arrayBuffer()));
 await fs.writeFile(`${dir}/thomas-${name}.json`,JSON.stringify({prompt,motion,imageRequest:img.requestId,videoRequest:vid.requestId},null,2)); console.log('complete',name);
})).then(r=>{for(let i=0;i<r.length;i++)if(r[i].status==='rejected')console.error(Object.keys(costumes)[i],r[i].reason)});
