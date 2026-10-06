import 'dotenv/config';
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {apiMiddleware} from './api.ts';
import {timingSafeEqual} from 'node:crypto';

// Paid routes must never run ungated in production.
if(process.env.NODE_ENV==='production'&&!process.env.TURNSTILE_SECRET){console.error('FATAL: TURNSTILE_SECRET is not set; refusing to serve paid routes without verification.');process.exit(1);}
const root=path.resolve('dist');
const allowedOrigins=new Set((process.env.APP_ORIGINS||'').split(',').filter(Boolean));
const originToken=process.env.ORIGIN_TOKEN;
const publicMedia=/^\/media\/(?:original\/[\w.-]+\.(?:wav|mp4|png)|generated\/[a-f0-9]{20}(?:-print)?\.(?:mp4|png)|voice\/[a-f0-9]{20}\.wav)$/;
const requests=new Map<string,{count:number;expires:number}>();
await Promise.all(['generated','profiles','voice'].map(name=>fs.mkdir(`public/media/${name}`,{recursive:true})));
await fs.mkdir('cache',{recursive:true});
const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.woff':'font/woff','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
 try{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Referrer-Policy','same-origin');
  res.setHeader('X-Robots-Tag','noindex, nofollow');
  res.setHeader('Permissions-Policy','camera=(self), microphone=(self)');
  if(req.url==='/healthz'){res.writeHead(200,{'Content-Type':'application/json'});res.end('{"ok":true}');return;}
  if(originToken){
   const supplied=Buffer.from(String(req.headers['x-cinco-origin-token']||'')),expected=Buffer.from(originToken);
   if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected)){res.writeHead(403);res.end('Use celeryman.fun');return;}
  }
  if(req.headers.origin&&!allowedOrigins.has(req.headers.origin)){res.writeHead(403);res.end('Origin not allowed');return;}
  if(req.url?.startsWith('/api/')){
   // Only job polling and health checks are reads; every other API call must be a limited POST.
   const route=new URL(req.url,'http://localhost').pathname;
   const readable=route.startsWith('/api/job/')||route==='/api/health';
   if(req.method!=='POST'&&!(readable&&['GET','HEAD'].includes(req.method||''))){res.writeHead(405,{'Content-Type':'application/json','Cache-Control':'no-store',Allow:readable?'GET, HEAD, POST':'POST'});res.end('{"error":"Method not allowed"}');return;}
  }
  if(req.method==='POST'&&req.url?.startsWith('/api/')){
   for(const [key,value] of requests)if(value.expires<Date.now())requests.delete(key);
   const client=originToken?String(req.headers['x-cinco-client-ip']||'unknown'):req.socket.remoteAddress||'unknown';
   const key=client+':'+new URL(req.url,'http://localhost').pathname,entry=requests.get(key)||{count:0,expires:Date.now()+60000};
   const limit=key.endsWith(':/api/profile')?5:30;
   if(entry.count>=limit){res.writeHead(429,{'Content-Type':'application/json','Retry-After':'60'});res.end('{"error":"Too many requests. Please try again in a minute."}');return;}
   entry.count++;requests.set(key,entry);
  }
  // Serve only what the desktop plays. Provenance JSON, identity frames and
  // uploaded photos stay private in the bucket even when an ID leaks.
  if(req.url?.startsWith('/media/')&&!publicMedia.test(new URL(req.url,'http://localhost').pathname)){res.writeHead(404);res.end('Media not found');return;}
  if(req.url?.startsWith('/api/')||req.url?.startsWith('/media/')){await apiMiddleware(req,res,()=>{res.writeHead(404);res.end();});return;}
  if(!['GET','HEAD'].includes(req.method||'')){res.writeHead(405);res.end();return;}
  const pathname=decodeURIComponent(new URL(req.url||'/','http://localhost').pathname);
  const relative=pathname==='/'?'index.html':pathname.slice(1);
  // Only ship and serve the desktop bundle. No source, reference files or voice lab.
  if(relative!=='index.html'&&!relative.startsWith('assets/')&&!relative.startsWith('fonts/')){res.writeHead(404);res.end('Not found');return;}
  let file=path.resolve(root,relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  // Retain hashed assets across deployments so a cached shell/open tab stays valid.
  if(relative.startsWith('assets/')&&!await fs.access(file).then(()=>true,()=>false)){
   const archive=path.resolve('cache/static-assets'),fallback=path.resolve(archive,relative.slice(7));
   if(!fallback.startsWith(archive+path.sep)){res.writeHead(404);res.end();return;}file=fallback;
  }
  const stat=await fs.stat(file);if(!stat.isFile())throw Error('Not a file');
  res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');
  res.setHeader('Content-Length',stat.size);
  res.setHeader('Cache-Control',relative==='index.html'?'public, max-age=0, s-maxage=30, must-revalidate':relative.startsWith('assets/')?'public, max-age=31536000, immutable':'public, max-age=3600, s-maxage=86400');
  if(req.method==='HEAD'){res.end();return;}
  const stream=createReadStream(file);stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
 }catch(error){console.error('Request failed:',error instanceof Error?error.message:'Unknown error');if(res.headersSent){res.destroy();return;}res.writeHead(500);res.end('Request failed');}
});
server.requestTimeout=120000;
server.listen(Number(process.env.PORT)||8080,'0.0.0.0',()=>console.log('Celeryman production server listening'));
process.on('SIGTERM',()=>{server.close();setTimeout(()=>process.exit(0),9000).unref();});
