import {sketch,type Action} from './protocol';
import type {Beat,DirectorState} from './director';
import {commandText} from './command-text';

/** Track script position so near-readings can prefer the expected command. */
export function createScriptGuide(parent:HTMLElement,inlineParent?:HTMLElement){
 let index=0;
 const guide=document.createElement('aside');guide.className='script-guide';guide.setAttribute('aria-label','Sketch script guide');
 guide.innerHTML='<div class="script-guide-title"><span>SUGGESTED LINE</span><span class="script-guide-count"></span></div><p class="script-guide-quote" aria-live="polite" aria-atomic="true"></p>';
 parent.append(guide);
 const inline=document.createElement('span');inline.className='input-suggestion';inline.setAttribute('aria-label','Suggested line');inline.setAttribute('aria-live','polite');inlineParent?.prepend(inline);
 // Desktop users talk with Space; touch users hold the Record button.
 const key=document.createElement('span'),touch=document.createElement('span');key.className='say-key';key.textContent='Hold space and say';touch.className='say-touch';touch.textContent='Hold Record and say';
 const typed=document.createElement('span');typed.className='say-type';typed.textContent='Type';
 const quote=guide.querySelector<HTMLElement>('.script-guide-quote')!,count=guide.querySelector<HTMLElement>('.script-guide-count')!;
 const normalize=(text:string)=>commandText(text).replace(/ /g,'');
 // After the sketch, answer whatever the computer is waiting on; otherwise show the
 // next thing the director can do that the user has not tried. Nothing cycles.
 const encores:{line:string;tried:(action:Action,beat?:Beat)=>boolean}[]=[
  {line:'Computer, show me a new sequence.',tried:action=>action==='custom'},
  {line:"What's up with the Mets?",tried:(_,beat)=>beat?.kind==='pitch'||beat?.kind==='reveal'},
  {line:'Make him evil.',tried:(_,beat)=>beat?.kind==='taboo'},
  {line:'Turn on turbo mode.',tried:(_,beat)=>beat?.kind==='mode'},
 ];
 let tried=new Set<string>(),director:DirectorState|undefined;
 // Each answer is worded to match the director's own yes/answer matching.
 function offScript(){
  if(director?.call)return 'Put them through.';
  if(director?.offer)return 'Yes, please.';
  if(director?.taboo)return director.taboo.stage==='warn'?'Yes.':director.taboo.request;
  if(director?.armed)return 'Oh, nice.';
  return (encores.find(encore=>!tried.has(encore.line))||encores[0]).line;
 }
 function render(){
  // Fold the attention-only cue into the question it introduces.
  if(sketch[index]?.action==='attention')index++;
  if(index===8)index=9;
  const line=sketch[index],text=index===9?"Now Tayne I can get into. Can I see a hat wobble?":index===14?"Oh shit! I'm okay.":line?.action==='beta'?`Computer, ${line.text.charAt(0).toLowerCase()+line.text.slice(1)}`:line?.text;count.textContent=line?`${index+1} / ${sketch.length}`:'Complete';
  const suggestion=text||offScript();
  quote.textContent=`“${suggestion}”`;
  // Teach the input on the opening line; later lines are just the words.
  if(index<=1)inline.replaceChildren('Suggestion: ',key,touch,typed,` “${suggestion}”`);else inline.textContent=`Suggestion: ${suggestion}`;inline.title=`Suggested line: ${suggestion}`;
 }
 render();
 return {
  reset(){index=0;tried=new Set();director=undefined;render();},
  nextIndex:()=>index,
  observe(text:string,action:Action,state?:DirectorState,beat?:Beat){
   director=state;for(const encore of encores)if(encore.tried(action,beat))tried.add(encore.line);
   if(action==='greeting'){index=1;render();return;}
   // One spoken reaction covers both short beats before the phone call.
   if(action==='reaction'&&index===14&&/^(?:ohshit)?(?:im|iam)okay$/.test(normalize(text))){index=16;render();return;}
   const match=sketch.findIndex((line,i)=>i>=index&&line.action===action&&(action!=='reaction'||normalize(line.text)===normalize(text)));
   if(match>=0){index=match+1;render();}
   else render();
  }
 };
}
