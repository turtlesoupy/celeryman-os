/** One terminal overlay for concurrent generation and first-frame loading. */
export function createGenerationOverlay(){
 const element=document.createElement('aside');element.className='generation-overlay hidden';element.setAttribute('role','status');element.setAttribute('aria-label','Sequence progress');
 const heading=document.createElement('strong');
 const bar=document.createElement('div');bar.className='progress';bar.setAttribute('role','progressbar');bar.setAttribute('aria-label','Generating sequence');
 const fill=document.createElement('i');bar.append(fill);element.append(heading,bar);
 const jobs=new Map<string,{label:string;stage:string}>();let epoch=-1,started=0,timer:number|undefined;
 function render(){
  element.classList.toggle('hidden',!jobs.size);
  if(!jobs.size){clearInterval(timer);timer=undefined;fill.style.width='100%';return;}
  const stages=[...new Set([...jobs.values()].map(job=>job.stage))];
  heading.textContent=stages.length===1?stages[0]:'Preparing sequence';
  // Cosmetic estimate: recent fast-path runs take ~4s median / 5.5s p80.
  // Chunky updates reach ~85% at 4s, then approach 98% without completing
  // until every real render/download/first-frame job is done.
  const elapsed=Math.max(0,performance.now()-started);
  fill.style.width=`${Math.floor(3+95*(1-Math.exp(-elapsed/2000)))}%`;
  bar.setAttribute('aria-valuetext',heading.textContent);
  element.title=[...jobs.values()].map(job=>`${job.label}: ${job.stage}`).join('\n');
 }
 return {
  element,
  begin(currentEpoch:number,key:string,label:string,stage='Loading sequence'){
   if(currentEpoch!==epoch){jobs.clear();epoch=currentEpoch;started=performance.now();}
   jobs.set(key,{label,stage});timer??=window.setInterval(render,300);render();
   return {
    update(stage:string){if(epoch!==currentEpoch||!jobs.has(key))return;jobs.set(key,{label,stage});render();},
    done(){if(epoch!==currentEpoch)return;jobs.delete(key);render();}
   };
  },
  clear(){epoch++;jobs.clear();render();}
 };
}
