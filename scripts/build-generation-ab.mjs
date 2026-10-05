import fs from 'node:fs/promises';import {readFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const photo=process.argv[2];if(!photo)throw Error('Usage: node scripts/build-generation-ab.mjs /path/to/regression-photo.jpg');
const out=path.resolve('analysis/optimization-20261005'),read=async name=>JSON.parse(await fs.readFile(path.join(out,name+'.json'),'utf8'));
const audit=await read('latency-audit'),portraits=await read('portrait-videos'),motion=await read('videos');
await fs.copyFile('reference/thomas-dimson.jpg',path.join(out,'identity-thomas.jpg'));await fs.copyFile(photo,path.join(out,'identity-upload.jpg'));
await fs.copyFile('public/media/original/celery-face.png',path.join(out,'sketch-celery-face.png'));
await fs.copyFile('public/media/original/celery-face.mp4',path.join(out,'sketch-celery-face.mp4'));
await fs.copyFile('public/media/original/celery.png',path.join(out,'sketch-celery.png'));
await fs.copyFile('public/media/motion/celery-5s.mp4',path.join(out,'sketch-celery.mp4'));
const pairs=[];
function add(id,title,description,person,a,b){if(!a?.file||!b?.file)return;id+='-'+createHash('sha256').update(readFileSync(a.file)).update(readFileSync(b.file)).digest('hex').slice(0,12);let candidates=[a,b].map(r=>({file:path.basename(r.file),kind:r.kind||(r.file.endsWith('.mp4')?'video':'image'),label:(r.model||(r.variant==='lite-refined'?'Nano Banana Lite + H3 Max Turbo (refined portrait prompt)':r.variant==='baseline'?'Nano Banana 2 + H3 Max Turbo':r.variant))+(r.outputFormat?' · '+r.outputFormat.toUpperCase():''),requestMs:r.requestMs}));if(createHash('sha256').update(id).digest()[0]%2)candidates.reverse();pairs.push({id,title,description,sketchImage:id.startsWith('celery-choreography')?'sketch-celery.png':'sketch-celery-face.png',sketchVideo:candidates[0].kind==='video'?(id.startsWith('celery-choreography')?'sketch-celery.mp4':'sketch-celery-face.mp4'):null,reference:`identity-${person}.jpg`,candidates})}
for(const person of ['thomas','upload']){
 const get=variant=>audit.find(r=>r.kind==='image'&&r.person===person&&r.variant===variant);
 add(`portrait-fair-${person}`,'Portrait image · '+(person==='thomas'?'Thomas':'Uploaded photo'),'Same source photo, portrait prompt, aspect ratio and seed. Compare likeness, costume and framing.',person,get('baseline'),get('lite'));
 add(`portrait-format-${person}`,'Portrait format · '+(person==='thomas'?'Thomas':'Uploaded photo'),'Independent generations with the same model, photo, prompt and seed; PNG versus JPEG output. Compare overall quality, not pixel-identical compression.',person,get('lite'),get('lite-jpeg'));
}
for(const round of [0,1]){const rows=audit.filter(r=>r.kind==='video'&&r.transport==='raw-http');add(`video-model-audit-${round}`,'Portrait animation · model comparison',`Same starting image, prompt, seed and output resolution. Repeat ${round+1} of 2.`, 'thomas',rows[round*2],rows[round*2+1])}
for(const person of ['thomas','upload'])add(`portrait-pipeline-${person}`,'Complete portrait pipeline · '+(person==='thomas'?'Thomas':'Uploaded photo'),'Different image models/prompts, same video model. Judge the complete result, including accessory changes during animation.',person,portraits.find(r=>r.person===person&&r.variant==='baseline'),portraits.find(r=>r.person===person&&r.variant==='lite-refined'));
add('celery-choreography','Celery Man choreography','Compare hands-on-hips movement and consistency. One method receives the original motion reference; one receives only a text description.','upload',motion.find(r=>r.character==='celery'&&r.variant==='original'),motion.find(r=>r.character==='celery'&&r.variant==='turbo'));
if(!pairs.length)throw Error('No completed comparisons');
const template=await fs.readFile('scripts/templates/generation-ab.html','utf8');await fs.writeFile(path.join(out,'ab.html'),template.replace('__PAIR_DATA__',JSON.stringify(pairs).replace(/</g,'\\u003c')));console.log(`Built ${pairs.length} A/B comparisons: http://127.0.0.1:5174/ab.html`);
