// Cloudflare Turnstile, minted once per desktop session (see session.ts).
// Site keys are public. Local development runs ungated unless
// VITE_TURNSTILE_SITE_KEY is set (Cloudflare's test keys work there).
const PRODUCTION_SITE_KEY='0x4AAAAAAFPpVQfNKWt2ZKaS';
const SITE_KEY=import.meta.env.VITE_TURNSTILE_SITE_KEY||(location.hostname==='celeryman.fun'?PRODUCTION_SITE_KEY:'');
const TOKEN_TIMEOUT_MS=15000;
type TurnstileApi={render:(container:HTMLElement,options:Record<string,unknown>)=>string;remove:(id:string)=>void};
export const turnstileConfigured=!!SITE_KEY;

let loading:Promise<TurnstileApi>|undefined;
function load(){
 loading??=new Promise<TurnstileApi>((resolve,reject)=>{
  const script=document.createElement('script');
  script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.async=true;
  script.onload=()=>{const api=(window as any).turnstile;if(api)resolve(api);else{loading=undefined;reject(Error('Verification could not start. Please reload the page.'));}};
  script.onerror=()=>{script.remove();loading=undefined;reject(Error('Verification could not load. Check your connection and reload the page.'));};
  document.head.append(script);
 });
 return loading;
}

/** Mint one single-use token with a fresh invisible widget. */
export async function turnstileToken(){
 const api=await load();
 const container=document.createElement('div');
 Object.assign(container.style,{position:'fixed',left:'0',top:'0',width:'1px',height:'1px',overflow:'hidden',opacity:'0',pointerEvents:'none'});
 document.body.append(container);let widget:string|undefined;
 try{
  return await new Promise<string>((resolve,reject)=>{
   const timer=window.setTimeout(()=>reject(Error('Verification timed out. Please reload the page.')),TOKEN_TIMEOUT_MS);
   const fail=()=>{clearTimeout(timer);reject(Error('Verification failed. Please reload the page.'));};
   widget=api.render(container,{sitekey:SITE_KEY,callback:(token:string)=>{clearTimeout(timer);resolve(token);},'error-callback':fail,'timeout-callback':fail});
  });
 }finally{if(widget!==undefined)try{api.remove(widget);}catch{/* Already removed. */}container.remove();}
}
