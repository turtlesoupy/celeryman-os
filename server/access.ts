import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';

const lifetime=7*24*60*60;
const equal=(a:string,b:string)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);};
export function privateAccess(password:string,secure=true){
 if(password.length<24)throw Error('SITE_PASSWORD must contain at least 24 characters');
 const attempts=new Map<string,{count:number;until:number}>();
 const sign=(value:string)=>createHmac('sha256',password).update(value).digest('base64url');
 return async(req:IncomingMessage,res:ServerResponse):Promise<boolean>=>{
  const pathname=new URL(req.url||'/','http://localhost').pathname;
  const cookie=req.headers.cookie?.split(';').map(v=>v.trim()).find(v=>v.startsWith('cinco_session='))?.slice(14)||'';
  const [expires,nonce,signature]=cookie.split('.');
  const valid=Number(expires)>Date.now()&&Number(expires)<Date.now()+lifetime*1000+60000&&!!nonce&&!!signature&&equal(signature,sign(`${expires}.${nonce}`));
  if(pathname==='/signout'&&req.method==='POST'){
   res.writeHead(303,{'Set-Cookie':'cinco_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(secure?'; Secure':''),Location:'/'});res.end();return false;
  }
  if(valid&&pathname!=='/signin')return true;
  res.setHeader('Cache-Control','no-store');
  let error='';
  if(pathname==='/signin'&&req.method==='POST'){
   const ip=req.socket.remoteAddress||'unknown';
   // Bound memory even if exposed directly through a provider URL.
   for(const [key,value] of attempts)if(value.until<Date.now())attempts.delete(key);
   const entry=attempts.get(ip)||{count:0,until:Date.now()+600000};
   if(entry.count>=15){res.writeHead(429,{'Retry-After':'600'});res.end('Too many attempts. Try again in ten minutes.');return false;}
   let raw='';for await(const chunk of req){raw+=chunk.toString();if(raw.length>4096){res.writeHead(413);res.end();return false;}}
   if(equal(new URLSearchParams(raw).get('password')||'',password)){
    const payload=`${Date.now()+lifetime*1000}.${randomBytes(16).toString('hex')}`;
    attempts.delete(ip);res.writeHead(303,{Location:'/', 'Set-Cookie':`cinco_session=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${lifetime}${secure?'; Secure':''}`});res.end();return false;
   }
   entry.count++;attempts.set(ip,entry);error='Access code not recognized.';
  }
  if(pathname.startsWith('/api/')||pathname.startsWith('/media/')){res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Sign in to the private computer first.'}));return false;}
  res.writeHead(error?401:200,{'Content-Type':'text/html; charset=utf-8'});
  res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private computer — Celeryman</title><style>body{margin:0;min-height:100svh;display:grid;place-items:center;background:#03a1b4;font-family:monospace;color:#172a29}main{box-sizing:border-box;width:min(420px,calc(100% - 32px));background:#d7ded8;border:3px outset #f7fbf8;padding:22px;box-shadow:5px 5px #126e7c}h1{font-size:22px;margin-top:0}p{line-height:1.5}label{display:block;margin-bottom:6px}input,button{box-sizing:border-box;width:100%;min-height:44px;font:inherit}input{border:2px inset #eee;padding:8px;background:white}button{margin-top:16px;background:#d7ded8;border:3px outset white;cursor:pointer}small{display:block;margin-top:16px}strong{color:#8f302b}</style><main><h1>CINCO ACCESS</h1><p>This computer is for invited guests.<br>Enter your access code to begin.</p><form action="/signin" method="post"><label for="password">Access code</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button>Enter computer</button></form><p role="alert"><strong>${error}</strong></p><small>Private session · Celeryman OS</small></main></html>`);
  return false;
 };
}
