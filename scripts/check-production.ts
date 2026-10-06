import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
const token='production-test-origin-secret-only';
const server=spawn(process.execPath,['--import','tsx','server/production.ts'],{env:{...process.env,PORT:'8088',ORIGIN_TOKEN:token,APP_ORIGINS:'https://celeryman.fun'},stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',c=>logs+=c);server.stderr.on('data',c=>logs+=c);
const request=(url:string,init:RequestInit={})=>fetch('http://127.0.0.1:8088'+url,{...init,headers:{'X-Cinco-Origin-Token':token,'X-Cinco-Client-IP':'test-client',...init.headers}});
try{
 for(let i=0;i<100;i++){if(logs.includes('listening'))break;if(server.exitCode!==null)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 assert.equal((await fetch('http://127.0.0.1:8088/')).status,403,'origin rejects bypass');
 assert.equal((await fetch('http://127.0.0.1:8088/healthz')).status,200,'probe works');
 assert.equal((await request('/')).status,200,'public desktop loads through edge');
 assert.equal((await request('/fonts/VT323-Regular.ttf')).status,200,'retro font is served');
 assert.equal((await request('/og.png')).headers.get('content-type'),'image/png','link preview image is served');
 for(const path of ['/.env','/server/api.ts','/reference/celery-man.mp4','/voice-lab/index.html'])assert.equal((await request(path)).status,404,path);
 const range=await request('/media/original/okay.wav',{headers:{Range:'bytes=0-43'}});
 assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,44);
 assert.equal((await request('/media/%2e%2e%2f%2e%2e%2f.env')).status,404,'traversal is rejected');
 // Only playable media is public; provenance, identity frames and uploaded photos stay private.
 for(const path of ['/media/generated/0123456789abcdef0123.json','/media/generated/identity-frame-0123456789abcdef0123.png','/media/profiles/00000000-0000-0000-0000-000000000000.jpg','/media/motion/celery-5s.mp4'])assert.equal((await request(path)).status,404,path);
 assert.equal((await request('/media/generated/0123456789abcdef0123.mp4?live=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).status,404,'forged live preview tokens are refused');
 assert.equal((await request('/api/health',{headers:{Origin:'https://evil.example'}})).status,403);
 assert.equal((await request('/api/transcribe/session',{method:'POST',headers:{Origin:'https://evil.example'},body:'{}'})).status,403,'transcription credentials reject foreign origins');
 const credentialGet=await request('/api/transcribe/session');
 assert.equal(credentialGet.status,405,'transcription credential creation requires POST');
 assert.equal(credentialGet.headers.get('cache-control'),'no-store');
 assert.equal((await request('/api/generate',{method:'PUT',body:'{}'})).status,405,'non-POST writes cannot bypass the rate limit');
 assert.equal((await request('/api/job/0123456789abcdef0123')).status,200,'job polling stays a GET');
 const command=await request('/api/command',{method:'POST',headers:{Origin:'https://celeryman.fun','Content-Type':'application/json'},body:JSON.stringify({text:'Computer?',context:{identity:'Thomas',character:'oyster',pending:'',history:[]}})});
 assert.equal(command.status,200);assert.equal((await command.json()).action,'attention');
 const streamed=await request('/api/command',{method:'POST',headers:{Origin:'https://celeryman.fun','Content-Type':'application/json',Accept:'text/event-stream'},body:JSON.stringify({text:'Computer?',context:{identity:'Thomas',character:'oyster',pending:'',history:[]}})});
 assert.match(streamed.headers.get('content-type')||'',/text\/event-stream/);assert.match(await streamed.text(),/event: command\ndata: .*"action":"attention"/,'commands stream to browsers');
 for(let i=0;i<31;i++){
  const result=await request('/api/unknown',{method:'POST',body:'{}'});
  assert.equal(result.status,i===30?429:404);
 }
 console.log('Production checks passed: origin protection, public entry, font, range playback, media allowlist, source isolation, CSRF, streamed protocol and rate limit.');
}finally{server.kill('SIGTERM');}
