// Builds with Cloudflare's always-pass test keys and checks the real widget, session header and renewal. No provider calls.
import assert from 'node:assert/strict';import {execFileSync,spawn} from 'node:child_process';
execFileSync('npm',['run','build'],{env:{...process.env,VITE_TURNSTILE_SITE_KEY:'1x00000000000000000000BB'},stdio:'ignore'});import {chromium} from 'playwright';
// Server gate: sessions, tampering, Cloudflare rejection and fail-closed boot.
const start=(port:number,secret:string)=>spawn(process.execPath,['--import','tsx','server/production.ts'],{env:{...process.env,PORT:String(port),ORIGIN_TOKEN:'ts-test',APP_ORIGINS:`http://127.0.0.1:${port}`,TURNSTILE_SECRET:secret},stdio:'ignore'});
const servers=[start(8831,'1x0000000000000000000000000000000AA'),start(8832,'2x0000000000000000000000000000000AA')];
const post=(port:number,route:string,body:unknown,headers:Record<string,string>={})=>fetch(`http://127.0.0.1:${port}/api/${route}`,{method:'POST',headers:{'X-Cinco-Origin-Token':'ts-test','X-Cinco-Client-IP':'t','Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const command={text:'Computer?',context:{identity:'Thomas',character:'oyster',pending:'',history:[]}};
try{
 await new Promise(r=>setTimeout(r,3500));
 let r=await post(8831,'command',command);assert.equal(r.status,401);assert.equal((await r.json()).code,'verification','paid route needs a session');
 r=await post(8831,'session',{});assert.equal(r.status,403,'missing Turnstile token');
 r=await post(8831,'session',{turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'});assert.equal(r.status,200);const {session,expiresAt}=await r.json();
 assert(expiresAt>Date.now()+3600e3);
 r=await post(8831,'command',command,{'X-Cinco-Session':session});assert.equal(r.status,200);assert.equal((await r.json()).action,'attention');
 const tampered=session.slice(0,-3)+(session.endsWith('a')?'b':'a')+session.slice(-2);
 assert.equal((await post(8831,'command',command,{'X-Cinco-Session':tampered})).status,401,'tampered session');
 const [expiry,nonce,sig]=session.split('.');assert.equal((await post(8831,'command',command,{'X-Cinco-Session':`${Date.now()-1}.${nonce}.${sig}`})).status,401,'re-dated session');
 assert.equal((await post(8832,'session',{turnstileToken:'XXXX.DUMMY.TOKEN.XXXX'})).status,403,'Cloudflare rejection');
 assert.equal((await post(8831,'client-event',{event:'video-visible'})).status,200,'diagnostics stay open');
 // Production refuses to boot without the secret.
 const bare=spawn(process.execPath,['--import','tsx','server/production.ts'],{env:{...process.env,PORT:'8833',NODE_ENV:'production',TURNSTILE_SECRET:''},stdio:'ignore'});
 const code=await new Promise(r=>bare.on('exit',r));assert.equal(code,1);
 console.log('Turnstile server checks passed');
}finally{servers.forEach(s=>s.kill('SIGTERM'));}

const server=spawn(process.execPath,['--import','tsx','server/production.ts'],{env:{...process.env,PORT:'8841',ORIGIN_TOKEN:'ts-test',APP_ORIGINS:'http://127.0.0.1:8841',TURNSTILE_SECRET:'1x0000000000000000000000000000000AA'},stdio:'ignore'});
const browser=await chromium.launch({headless:true});
try{
 await new Promise(r=>setTimeout(r,3500));
 const page=await browser.newPage({extraHTTPHeaders:{'X-Cinco-Origin-Token':'ts-test'}});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const sessions:number[]=[],commands:string[]=[];
 page.on('response',r=>{if(r.url().endsWith('/api/session'))sessions.push(r.status());});
 await page.route('**/api/voice/stream',route=>route.fulfill({status:503,json:{error:'no voice in test'}}));
 await page.route('**/api/command',async route=>{
  commands.push(route.request().headers()['x-cinco-session']||'');
  if(commands.length===1)return route.fulfill({status:401,json:{error:'Your session expired. Verifying again…',code:'verification'}});
  return route.fulfill({json:{action:'reaction',response:''}});
 });
 const t0=Date.now();await page.goto('http://127.0.0.1:8841/');
 await page.waitForFunction(()=>true);await page.waitForTimeout(100);
 await new Promise<void>(resolve=>{const check=()=>sessions.length?resolve():setTimeout(check,100);check();});
 console.log('prewarmed session after',Date.now()-t0,'ms, status',sessions[0]);
 assert.equal(sessions[0],200,'Turnstile token exchanged for a session at load');
 await page.evaluate(()=>{const c=(window as any).cinco;c.setIdentity('thomas','Thomas');c.setMode('live');c.setSound(false);});
 await page.evaluate(()=>(window as any).cinco.dispatch('Computer, tell me a joke'));
 await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'),null,{timeout:20000});
 assert.equal(commands.length,2,'rejected command retried once');
 assert(commands[0]&&commands[1]&&commands[0]!==commands[1],'retry carried a renewed session');
 assert.deepEqual(sessions,[200,200]);assert.deepEqual(errors,[]);
 console.log('Turnstile browser checks passed');
}finally{await browser.close();server.kill('SIGTERM');
 // Leave a normal build behind; the test site key must never ship.
 execFileSync('npm',['run','build'],{stdio:'ignore'});}
