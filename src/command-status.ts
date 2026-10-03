import {describeServiceError} from './service-errors';
/** Persistent diagnostics: a command is only idle once all of its work settles. */
export function createCommandStatus(parent:HTMLElement,idle=()=> 'Waiting for command · hold Space to talk'){
 const element=document.createElement('aside');element.className='command-status';element.setAttribute('aria-label','Computer activity');
 element.innerHTML='<div class="command-status-line"><span class="command-status-label" role="status"></span><span class="command-status-time"></span></div><div class="command-status-echo" aria-live="polite"></div><div class="command-status-detail"></div>';parent.append(element);
 const alert=document.createElement('aside');alert.className='command-error hidden';alert.setAttribute('role','alert');alert.setAttribute('aria-label','Computer error');
 alert.innerHTML='<strong class="command-error-title"></strong><span class="command-error-message"></span><span class="command-error-recovery"></span>';parent.append(alert);
 const errorTitle=alert.querySelector<HTMLElement>('.command-error-title')!,errorMessage=alert.querySelector<HTMLElement>('.command-error-message')!,recovery=alert.querySelector<HTMLElement>('.command-error-recovery')!;
 const clearError=()=>{alert.classList.add('hidden');parent.classList.remove('has-error');};
 const echo=element.querySelector<HTMLElement>('.command-status-echo')!,label=element.querySelector<HTMLElement>('.command-status-label')!,time=element.querySelector<HTMLElement>('.command-status-time')!,detail=element.querySelector<HTMLElement>('.command-status-detail')!;
 let token=0,start=0,working=false,failed=false,phaseText='',completedAt=0,detailText='';
 const jobs=new Map<string,{text:string;since:number}>();
 function render(){
  const busy=!failed&&(working||jobs.size>0),now=performance.now();
  const stages=[...(working&&(!jobs.size||phaseText==='Interpreting command')?[phaseText]:[]),...Array.from(jobs.values(),job=>job.text)];
  label.textContent=failed?phaseText:busy?[...new Set(stages)].join(' · '):idle();
  detail.textContent=detailText;element.classList.toggle('busy',busy);
  time.textContent=busy?`${((now-start)/1000).toFixed(1)}s`:completedAt?`${failed?'failed':'done'} ${((completedAt-start)/1000).toFixed(1)}s`:'';
  const waiting=[...jobs.values()].filter(job=>now-job.since>=12000);
  element.classList.toggle('waiting',busy&&waiting.length>0);
  if(busy&&waiting.length)time.textContent+=' · waiting';
  element.title=detailText+'\n'+(jobs.size?[...jobs.values()].map(job=>`${job.text}: ${((now-job.since)/1000).toFixed(1)}s`).join('\n'):label.textContent);
 }
 function phase(id:number,text:string,inProgress=true){if(id!==token||failed)return;working=inProgress;phaseText=text;render();}
 window.setInterval(render,250);render();
 return {
  begin(text:string,heard='',prefix='Heard'){clearError();token++;jobs.clear();failed=false;working=true;phaseText=text;start=performance.now();completedAt=0;element.classList.remove('failed');detailText='';echo.textContent=heard?`${prefix}: “${heard}”`:'';render();return token;},
  current:(id:number)=>id===token,
  echo(id:number,text:string,prefix='Heard'){if(id===token)echo.textContent=`${prefix}: “${text}”`;},
  detail(id:number,text:string){if(id===token){detailText=text;render();}},
  phase,
  job(id:number,key:string,text:string){if(id!==token||failed)return;if(jobs.get(key)?.text!==text)jobs.set(key,{text,since:performance.now()});render();},
  jobDone(id:number,key:string){if(id!==token||!jobs.delete(key))return;if(!failed&&!working&&!jobs.size)completedAt=performance.now();render();},
  finish(id:number){if(id!==token||failed)return;working=false;completedAt=performance.now();render();},
  error(id:number,message:string){if(id!==token||failed)return;const failure=describeServiceError(message);failed=true;working=false;phaseText='Stopped · '+failure.title;errorTitle.textContent='ERROR · '+failure.title;const guidance=(text:string)=>parent.closest('.mobile')?text.replace(/\bF1\b/g,'More'):text;errorMessage.textContent=guidance(failure.message);recovery.textContent=guidance(failure.recovery);alert.classList.remove('hidden');parent.classList.add('has-error');completedAt=performance.now();element.classList.add('failed');render();},
  clear(){clearError();token++;jobs.clear();failed=false;working=false;completedAt=0;detailText='';echo.textContent='';element.classList.remove('failed');render();}
 };
}
