import {describeServiceError,primaryFailure,type ServiceFailure} from './service-errors';
/** Persistent diagnostics: a command is only idle once all of its work settles. */
export function createCommandStatus(parent:HTMLElement,idle=()=> 'Ready',detailsParent=parent){
 const element=document.createElement('aside');element.className='command-status';element.setAttribute('aria-label','Computer activity');
 element.innerHTML='<div class="command-status-line"><span class="command-status-label" role="status"></span><span class="command-status-time"></span></div><div class="command-status-echo" aria-live="polite"></div><div class="command-status-detail"></div>';parent.append(element);
 const alert=document.createElement('aside');alert.className='command-error hidden';alert.setAttribute('role','alert');alert.setAttribute('aria-label','Computer error');
 alert.innerHTML='<div class="command-error-heading"><strong class="command-error-title"></strong><div class="command-error-actions"><button type="button" class="classic-button retry-error hidden">Retry command</button><button type="button" class="classic-button dismiss-error" aria-label="Dismiss error">×</button></div></div><ul class="command-error-list"></ul>';parent.append(alert);
 const errorTitle=alert.querySelector<HTMLElement>('.command-error-title')!,list=alert.querySelector<HTMLUListElement>('.command-error-list')!,retry=alert.querySelector<HTMLButtonElement>('.retry-error')!;
 let failures:ServiceFailure[]=[],retryAction:(()=>Promise<unknown>)|undefined;
 const clearError=()=>{failures=[];alert.classList.add('hidden');parent.classList.remove('has-error','has-warning');};
 retry.onclick=()=>{const action=retryAction;if(!action)return;retry.disabled=true;void action().catch(()=>{}).finally(()=>{retry.disabled=false;});};
 alert.querySelector<HTMLButtonElement>('.dismiss-error')!.onclick=()=>{clearError();if(failed){failed=false;phaseText='';jobs.clear();completedAt=0;element.classList.remove('failed');}render();};
 function renderErrors(){
  const primary=primaryFailure(failures);if(!primary)return;
  errorTitle.textContent=(primary.blocking?'ERROR':'NOTICE')+' · '+primary.title;
  const guidance=(text:string)=>text.replace(/\bF1\b/g,'Settings');
  list.replaceChildren();
  for(const failure of failures){const item=document.createElement('li');const message=document.createElement('span'),help=document.createElement('span'),details=document.createElement('details'),summary=document.createElement('summary'),raw=document.createElement('pre');
   message.className='command-error-message';message.textContent=(failures.length>1?failure.title+': ':'')+guidance(failure.message);
   help.className='command-error-recovery';help.textContent=guidance(primary.blocking&&!failure.blocking?failure.recovery.replace(/^(The dancer can still play|The visual sequence can continue|The video can still play)\. /,''):failure.recovery);summary.textContent='Technical details';raw.textContent=failure.details;details.append(summary,raw);item.append(message,help,details);list.append(item);
  }
  retry.classList.toggle('hidden',!retryAction);alert.classList.remove('hidden');parent.classList.toggle('has-error',primary.blocking);parent.classList.toggle('has-warning',!primary.blocking);
 }
 const echo=element.querySelector<HTMLElement>('.command-status-echo')!,label=element.querySelector<HTMLElement>('.command-status-label')!,time=element.querySelector<HTMLElement>('.command-status-time')!,detail=element.querySelector<HTMLElement>('.command-status-detail')!;
 if(detailsParent!==parent)detailsParent.append(echo,detail,alert);
 let token=0,start=0,working=false,failed=false,phaseText='',completedAt=0,detailText='';
 const jobs=new Map<string,{text:string;since:number}>();
 function render(){
  const busy=!failed&&(working||jobs.size>0),now=performance.now();
  // Show only the input phases; the sequence overlay already reports render jobs.
  label.textContent=failed||working&&(!jobs.size||phaseText==='Interpreting command')?phaseText:idle();
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
  begin(text:string,heard='',prefix='Heard'){clearError();retryAction=undefined;token++;jobs.clear();failed=false;working=true;phaseText=text;start=performance.now();completedAt=0;element.classList.remove('failed');detailText='';echo.textContent=heard?`${prefix}: “${heard}”`:'';render();return token;},
  current:(id:number)=>id===token,
  retry(id:number,action:()=>Promise<unknown>){if(id===token){retryAction=action;retry.classList.remove('hidden');}},
  echo(id:number,text:string,prefix='Heard'){if(id===token)echo.textContent=`${prefix}: “${text}”`;},
  detail(id:number,text:string){if(id===token){detailText=text;render();}},
  phase,
  job(id:number,key:string,text:string){if(id!==token||failed)return;if(jobs.get(key)?.text!==text)jobs.set(key,{text,since:performance.now()});render();},
  jobDone(id:number,key:string){if(id!==token||!jobs.delete(key))return;if(!failed&&!working&&!jobs.size)completedAt=performance.now();render();},
  finish(id:number){if(id!==token||failed)return;working=false;completedAt=performance.now();render();},
  error(id:number,message:string){if(id!==token)return;const failure=describeServiceError(message);if(!failures.some(f=>f.details===message))failures.push(failure);const primary=primaryFailure(failures)!;failed=primary.blocking;if(failed){working=false;phaseText=primary.status||'Stopped · '+primary.title;completedAt=performance.now();}element.classList.toggle('failed',failed);renderErrors();render();},
  clear(){clearError();token++;jobs.clear();failed=false;working=false;completedAt=0;detailText='';echo.textContent='';element.classList.remove('failed');render();}
 };
}
