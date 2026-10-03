import {sketch,type Action} from './protocol';

/** Read-only cues: suggestions never run or constrain a command. */
export function createScriptGuide(parent:HTMLElement){
 let index=0;
 const guide=document.createElement('aside');guide.className='script-guide';guide.setAttribute('aria-label','Sketch script guide');
 guide.innerHTML='<div class="script-guide-title"><span>SUGGESTED LINE</span><span class="script-guide-count"></span></div><p class="script-guide-quote" aria-live="polite" aria-atomic="true"></p>';
 parent.append(guide);
 const quote=guide.querySelector<HTMLElement>('.script-guide-quote')!,count=guide.querySelector<HTMLElement>('.script-guide-count')!;
 const normalize=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
 function render(){
  const line=sketch[index];count.textContent=line?`${index+1} / ${sketch.length}`:'Complete';
  quote.textContent=line?`“${line.text}”`:'End of the sketch. Keep experimenting.';
 }
 render();
 return {
  reset(){index=0;render();},
  observe(text:string,action:Action){
   if(action==='greeting'){index=1;render();return;}
   const match=sketch.findIndex((line,i)=>i>=index&&line.action===action&&(action!=='reaction'||normalize(line.text)===normalize(text)));
   if(match>=0){index=match+1;render();}
  }
 };
}
