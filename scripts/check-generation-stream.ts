import assert from 'node:assert/strict';
import {chromium,type Page} from 'playwright';

// Offline check of streamed commands and generation progress (no provider calls).
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const video='/media/original/celery.mp4',id='0123456789abcdef0123';
const plan={action:'custom',response:'Okay.',label:'CARROT',costume:'carrot suit',motion:'hops',generationId:id,generationRequest:{profile:'thomas',character:'custom',variant:'base',costume:'carrot suit',motion:'hops',fastPath:true,canonical:false}};
const sse=(...events:[string,unknown][])=>events.map(([event,data])=>`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
const working={id,status:'working',stage:'Rendering dance'},ready={id,status:'working',stage:'Loading sequence',previewUrl:video+'?live=1',url:video};

async function scenario(name:string,routes:(page:Page,calls:{url:string;body:any;accept:string}[])=>Promise<void>,expectSrc:string){
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors:string[]=[],calls:{url:string;body:any;accept:string}[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.routeWebSocket('**',ws=>ws.close());
 await page.route('**/api/voice/stream',route=>route.fulfill({status:503,json:{error:'no voice in test'}}));
 await page.route(/\/api\/(client-event|warm)/,route=>route.fulfill({json:{ok:true}}));
 await routes(page,calls);
 // Registered last so it sees every request first, then defers to the mocks.
 await page.route('**/api/**',route=>{const r=route.request();const url=new URL(r.url()).pathname;if(url!=='/api/client-event'&&url!=='/api/warm')calls.push({url,body:r.postDataJSON(),accept:r.headers().accept||''});return route.fallback();});
 await page.goto(origin);
 await page.evaluate(()=>{const c=(window as any).cinco;c.setIdentity('thomas','Thomas');c.setMode('live');c.setSound(false);});
 await page.evaluate(()=>(window as any).cinco.dispatch('Computer, show me a carrot dance'));
 const src=await page.waitForFunction(()=>document.querySelector<HTMLVideoElement>('.custom-dancer video')?.getAttribute('src'),null,{timeout:15000}).then(h=>h.jsonValue());
 assert.equal(src,expectSrc,name);assert.deepEqual(errors,[],name);
 await browser.close();return calls;
}

let calls=await scenario('command stream carries generation',async page=>{
 await page.route('**/api/command',route=>route.fulfill({headers:{'Content-Type':'text/event-stream'},body:sse(['command',plan],['job',working],['job',ready])}));
},video+'?live=1');
assert.deepEqual(calls.map(c=>c.url),['/api/command'],'no extra generate or polling requests');
assert.match(calls[0].accept,/text\/event-stream/);

calls=await scenario('dropped command stream rejoins by request body',async page=>{
 await page.route('**/api/command',route=>route.fulfill({headers:{'Content-Type':'text/event-stream'},body:sse(['command',plan],['job',working])}));
 await page.route('**/api/generate',route=>route.fulfill({headers:{'Content-Type':'text/event-stream'},body:sse(['job',{...ready,status:'complete',stage:'Ready'}])}));
},video);
assert.deepEqual(calls.map(c=>c.url),['/api/command','/api/generate']);
assert.deepEqual(calls[1].body,plan.generationRequest,'rejoins with the exact generation body');

calls=await scenario('JSON-only server is polled',async page=>{
 await page.route('**/api/command',route=>route.fulfill({json:plan}));
 await page.route('**/api/generate',route=>route.fulfill({json:working}));
 let polls=0;await page.route('**/api/job/*',route=>route.fulfill({json:++polls<2?working:ready}));
},video+'?live=1');
assert.deepEqual(calls.map(c=>c.url),['/api/command','/api/generate','/api/job/'+id,'/api/job/'+id]);

console.log('Generation stream passed: streamed command progress, dropped-stream rejoin by body, and JSON polling fallback.');
