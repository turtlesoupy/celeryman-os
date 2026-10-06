import {turnstileConfigured,turnstileToken} from './turnstile';

// One Turnstile check buys a signed session; paid API calls carry it so
// commands never wait on a challenge. Renew a little before it expires.
const RENEW_MARGIN_MS=5*60000;
let current:{token:string;expiresAt:number}|undefined,pending:Promise<string>|undefined;

export function ensureSession(renew=false):Promise<string>{
 if(!turnstileConfigured)return Promise.resolve('');
 if(renew)current=undefined;
 if(current&&current.expiresAt-RENEW_MARGIN_MS>Date.now())return Promise.resolve(current.token);
 pending??=(async()=>{
  const turnstile=await turnstileToken();
  const response=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({turnstileToken:turnstile})});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.session)throw Error(data.error||'Verification failed. Please reload the page.');
  current={token:data.session,expiresAt:Number(data.expiresAt)};return current.token;
 })().finally(()=>{pending=undefined;});
 return pending;
}
/** Start verification early (while the identity launcher is open). */
export function prewarmSession(){void ensureSession().catch(()=>{});}

/** Send a gated request with the session, renewing once if the server rejects it. */
export async function withSession(send:(headers:Record<string,string>)=>Promise<Response>){
 const headers=async(renew=false):Promise<Record<string,string>>=>{const token=await ensureSession(renew);return token?{'X-Cinco-Session':token}:{};};
 const response=await send(await headers());
 if(response.status!==401||!turnstileConfigured)return response;
 await response.body?.cancel();return send(await headers(true));
}
