import assert from 'node:assert/strict';
import worker from '../deploy/cloudflare-worker.js';
const stored=new Map();let calls=0;const pending=[];
globalThis.caches={default:{match:async key=>stored.get(key.url)?.clone(),put:async(key,response)=>stored.set(key.url,response)}};
globalThis.fetch=async()=>{calls++;return new Response('asset',{headers:{'Content-Type':'application/javascript','Cache-Control':'public, max-age=31536000, immutable'}});};
const env={ORIGIN_URL:'https://origin.example',ORIGIN_TOKEN:'test'},ctx={waitUntil:p=>pending.push(p)};
const get=(path,headers)=>worker.fetch(new Request('https://celeryman.fun'+path,{headers}),env,ctx);
assert.equal((await get('/assets/test-123.js')).headers.get('X-Cinco-Cache'),'MISS');await Promise.all(pending);
assert.equal((await get('/assets/test-123.js')).headers.get('X-Cinco-Cache'),'HIT');assert.equal(calls,1);
for(const path of ['/api/voice/stream','/media/profiles/photo.jpg']){assert.equal((await get(path)).headers.get('Cache-Control'),'no-store');}
for(const headers of [{Cookie:'session=test'},{Authorization:'Bearer test'},{Origin:'https://other.example'},{Range:'bytes=0-9'}])assert.equal((await get('/assets/test-123.js',headers)).headers.get('X-Cinco-Cache'),'BYPASS');
globalThis.fetch=async()=>{calls++;return new Response('<script src="/assets/test-123.js"></script>',{headers:{'Content-Type':'text/html','Cache-Control':'public, max-age=0, s-maxage=30'}});};
const before=calls;assert.match((await get('/?fastPath=1')).headers.get('Cache-Control'),/max-age=0, s-maxage=30/);await Promise.all(pending);
assert.equal((await get('/?fastPath=1')).headers.get('X-Cinco-Cache'),'HIT');assert.equal(calls,before+1);
assert.equal((await get('/?fastPath=1',{Cookie:'session=custom'})).headers.get('Cache-Control'),'no-store');
assert.equal((await get('/?fastPath=0')).headers.get('X-Cinco-Cache'),'MISS');await Promise.all(pending);
globalThis.fetch=async()=>new Response('login',{headers:{'Content-Type':'text/html','Cache-Control':'no-store','Set-Cookie':'gate=1'}});
assert.equal((await get('/assets/private.js')).headers.get('Cache-Control'),'no-store');assert.equal(stored.size,3);
console.log('Passed edge MISS→HIT, origin request avoidance, dynamic/media bypass, credential/range bypass and login exclusion.');
