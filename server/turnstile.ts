import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage} from 'node:http';

// Cloudflare Turnstile proves a browser once, when the desktop starts. The
// server then issues a short signed session so voice commands never wait on a
// challenge. Paid routes require that session whenever TURNSTILE_SECRET is set.
const secret=process.env.TURNSTILE_SECRET;
export const turnstileEnabled=!!secret;
const SESSION_MS=2*60*60*1000;
const hostnames=(process.env.TURNSTILE_HOSTNAMES||'celeryman.fun').split(',');
// Every instance shares ORIGIN_TOKEN in production, so any instance can check a session.
const signingKey=createHmac('sha256','celeryman-session-v1').update(process.env.SESSION_SECRET||process.env.ORIGIN_TOKEN||randomBytes(32).toString('hex')).digest();
const sign=(payload:string)=>createHmac('sha256',signingKey).update(payload).digest('base64url');

export class VerificationError extends Error{constructor(message:string,readonly status=403){super(message);}}

export function clientIp(req:IncomingMessage){return String(req.headers['x-cinco-client-ip']||req.socket.remoteAddress||'');}

/** Verify a single-use Turnstile token with Cloudflare and issue a session. */
export async function startSession(token:unknown,req:IncomingMessage){
 if(!secret)return {session:'',expiresAt:Date.now()+SESSION_MS};
 if(typeof token!=='string'||!token)throw new VerificationError('Verification required. Please reload the page.');
 const form=new URLSearchParams({secret,response:token});const ip=clientIp(req);if(ip&&ip!=='unknown')form.set('remoteip',ip);
 let outcome:{success?:boolean;hostname?:string;'error-codes'?:string[]};
 try{outcome=await (await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',body:form,signal:AbortSignal.timeout(10000)})).json();}
 catch{throw new VerificationError('Verification is temporarily unavailable. Please try again.',503);}
 // Cloudflare's test keys report example.com; real keys must match the site.
 const testKey=secret.startsWith('1x0000000000000000000000000000000');
 if(!outcome.success||(!testKey&&!hostnames.includes(outcome.hostname||''))){
  console.warn(JSON.stringify({severity:'WARNING',event:'turnstile-rejected',errorCodes:outcome['error-codes'],hostname:outcome.hostname}));
  throw new VerificationError('Verification failed. Please reload the page.');
 }
 const expiresAt=Date.now()+SESSION_MS,payload=`${expiresAt}.${randomBytes(9).toString('base64url')}`;
 return {session:`${payload}.${sign(payload)}`,expiresAt};
}

// Fresh generations each client may start per window. Keyed on the Cloudflare-reported
// IP, not the session, so reloading for a new session does not reset it. Instances count
// independently, so with N instances a client can reach N times this.
const GENERATION_LIMIT=Number(process.env.SESSION_GENERATION_LIMIT)||60;
const GENERATION_WINDOW_MS=2*60*60*1000;
const generationCounts=new Map<string,{count:number;resetAt:number}>();

/** Records a fresh generation for the requesting client; returns an error message once over the limit. */
export function chargeGeneration(req:IncomingMessage){
 if(!secret)return undefined;
 const now=Date.now(),client=clientIp(req);
 for(const [key,entry] of generationCounts)if(entry.resetAt<now)generationCounts.delete(key);
 const entry=generationCounts.get(client)||{count:0,resetAt:now+GENERATION_WINDOW_MS};
 if(entry.count>=GENERATION_LIMIT)return `You have made a lot of sequences. Try again in ${Math.ceil((entry.resetAt-now)/60000)} minutes.`;
 entry.count++;generationCounts.set(client,entry);return undefined;
}

/** Throws unless the request carries a valid, unexpired session (when Turnstile is on). */
export function requireSession(req:IncomingMessage){
 if(!secret)return;
 const token=String(req.headers['x-cinco-session']||''),split=token.lastIndexOf('.');
 const payload=token.slice(0,split),signature=Buffer.from(token.slice(split+1)),expected=Buffer.from(sign(payload));
 const valid=split>0&&signature.length===expected.length&&timingSafeEqual(signature,expected);
 if(!valid||!(Number(payload.split('.')[0])>Date.now()))throw new VerificationError('Your session expired. Verifying again…',401);
}
