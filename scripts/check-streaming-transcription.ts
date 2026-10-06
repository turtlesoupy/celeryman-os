import assert from 'node:assert/strict';
import {chromium,type Page} from 'playwright';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import vm from 'node:vm';

const dir='benchmarks/streaming-transcription';
await fs.mkdir(dir,{recursive:true});await fs.mkdir('analysis',{recursive:true});
const worklet=await fs.readFile('src/transcription-worklet.js','utf8');
// Verify resampling preserves duration and pitch across block boundaries.
for(const rate of [44100,48000,24000]){
 let Processor:any;const frames:ArrayBuffer[]=[];
 class Base {port={onmessage:undefined as any,postMessage:(data:any)=>{if(data&&typeof data==='object'&&data.byteLength)frames.push(data);}};}
 const sandbox={sampleRate:rate,AudioWorkletProcessor:Base,registerProcessor:(_name:string,value:any)=>Processor=value};
 vm.runInNewContext(worklet,sandbox);
 const capture=new Processor();
 for(let offset=0;offset<rate;offset+=128){
  const samples=Float32Array.from({length:Math.min(128,rate-offset)},(_,i)=>.5*Math.sin(2*Math.PI*440*(offset+i)/rate));
  capture.process([[samples]]);
 }
 capture.port.onmessage({data:'flush'});
 const pcm=Buffer.concat(frames.map(x=>Buffer.from(x)));
 assert.ok(Math.abs(pcm.length/2-24000)<=1,`duration at ${rate}`);
 let crossings=0;for(let i=2;i<pcm.length;i+=2)if(pcm.readInt16LE(i-2)<=0&&pcm.readInt16LE(i)>0)crossings++;
 assert.ok(Math.abs(crossings-440)<=1,`pitch at ${rate}`);
}

execFileSync('say',['-v','Samantha','-r','145','-o','analysis/streaming-pause.aiff','Computer, pause.']);
execFileSync('ffmpeg',['-y','-v','error','-i','analysis/streaming-pause.aiff','-af','adelay=500,apad=pad_dur=1','-ar','48000','-ac','1','analysis/streaming-pause.wav']);
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${process.cwd()}/analysis/streaming-pause.wav`]});
const report:any={date:new Date().toISOString(),checks:['resampler: 24/44.1/48 kHz duration and 440 Hz pitch'],cases:[]};
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
async function open(mode:string){
 const page=await browser.newPage({permissions:['microphone']});
 const errors:string[]=[];let fallback=0,connections=0,commits=0,bytes=0,nonzero=false,closed=0;
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/api/warm',route=>route.fulfill({json:{ok:true}}));
 if(!mode.startsWith('live')){
  await page.route('**/api/command',route=>route.fulfill({json:{action:/resume/i.test(route.request().postDataJSON().text)?'resume':'pause',response:''}}));
  await page.route('**/api/transcribe/session',route=>route.fulfill({status:mode==='token-failure'?503:200,json:{value:'test-transcription-credential'}}));
  await page.route('**/api/transcribe',async route=>{fallback++;const body=route.request().postDataJSON();assert.ok(Buffer.from(body.audio,'base64').length>1000);await route.fulfill({json:{text:'Pause.',model:'file-fallback-test',requestId:body.requestId,transcriptionMs:1}});});
  await page.routeWebSocket('wss://api.openai.com/v1/realtime?intent=transcription',socket=>{
   const id=`item_${++connections}`;let partial=false;const text=connections===1?'Pause.':'Resume.';
   socket.send(JSON.stringify({type:'session.created'}));
   socket.onClose(()=>closed++);
   socket.onMessage(message=>{
    const e=JSON.parse(String(message));
    if(e.type==='input_audio_buffer.append'){
     const pcm=Buffer.from(e.audio,'base64');assert.equal(pcm.length%2,0);assert.ok(pcm.length<=4800);bytes+=pcm.length;nonzero ||=pcm.some(x=>x!==0);
     if(mode==='disconnect'){socket.close();return;}
     if(!partial){partial=true;socket.send(JSON.stringify({type:'conversation.item.input_audio_transcription.delta',item_id:id,delta:text}));}
    }
    if(e.type==='input_audio_buffer.commit'){
     commits++;socket.send(JSON.stringify({type:'input_audio_buffer.committed',item_id:id}));
     // A final for another item must not be executed.
     socket.send(JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:'stale_item',transcript:'Reset.'}));
     if(mode!=='timeout'&&mode!=='cancel'&&!(mode==='supersede'&&connections===1))socket.send(JSON.stringify({type:'conversation.item.input_audio_transcription.completed',item_id:id,transcript:text}));
    }
   });
  });
 }else {
  if(mode==='live-file')await page.route('**/api/transcribe/session',route=>route.fulfill({status:503,json:{error:'File-path comparison'}}));
  page.on('request',req=>{if(new URL(req.url()).pathname==='/api/transcribe')fallback++;});
  page.on('websocket',socket=>{
   if(!socket.url().startsWith('wss://api.openai.com/'))return;
   connections++;socket.on('close',()=>closed++);
   socket.on('framesent',frame=>{const e=JSON.parse(String(frame.payload));if(e.type==='input_audio_buffer.commit')commits++;if(e.type==='input_audio_buffer.append'){const pcm=Buffer.from(e.audio,'base64');bytes+=pcm.length;nonzero ||=pcm.some(x=>x!==0);}});
  });
 }
 const entry=await page.goto(origin+(origin.includes('?')?'&':'?')+'streamingTranscription=1');assert.equal(entry?.status(),200,'test desktop must be accessible');await page.getByRole('button',{name:'Start',exact:true}).click();
 await page.locator('.launch').waitFor({state:'detached'});
 return {page,stats:()=>({fallback,connections,commits,bytes,nonzero,closed,errors})};
}
async function record(page:Page){
 await page.keyboard.down('Space');
 await page.waitForFunction(()=>document.querySelector('.record-button')?.getAttribute('data-state')==='recording');
 await page.waitForTimeout(2300);
 const before=await page.evaluate(()=>(window as any).cinco.events);
 assert.equal(before.filter((e:any)=>e.kind==='input'&&e.source==='microphone').length,0,'partials must not execute');
 const releasedAt=await page.evaluate(()=>performance.now());await page.keyboard.up('Space');return releasedAt;
}
try{
 for(const mode of (process.argv.includes('--supersede-only')?['supersede']:process.argv.includes('--compare')?['live','live-file','live','live-file','live','live-file']:process.argv.includes('--only-live')?['live']:['success','token-failure','disconnect','timeout','cancel','supersede',...(process.argv.includes('--live')?['live']:[])])){
  const {page,stats}=await open(mode);
  try{
   const releasedAt=await record(page);
   if(mode==='cancel'){
    await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='microphone-capture'));
    await page.evaluate(()=>(window as any).cinco.reset());await page.waitForTimeout(5500);
    const events=await page.evaluate(()=>(window as any).cinco.events);
    assert.equal(events.filter((e:any)=>e.kind==='input'&&e.source==='microphone').length,0);assert.equal(stats().fallback,0);
   }else if(mode==='supersede'){
    await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='microphone-capture'));
    await page.keyboard.down('Space');await page.waitForTimeout(2300);await page.keyboard.up('Space');
    await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.action==='resume'));
    const inputs=await page.evaluate(()=>(window as any).cinco.events.filter((e:any)=>e.kind==='input'&&e.source==='microphone'));
    assert.equal(inputs.length,1);assert.equal(inputs[0].text,'Resume.');assert.equal(stats().fallback,0);
   }else{
    await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.action==='pause'),null,{timeout:20000});
    const events=await page.evaluate(()=>(window as any).cinco.events);
    const transcript=events.find((e:any)=>e.kind==='transcription');
    assert.equal(events.filter((e:any)=>e.kind==='input'&&e.source==='microphone').length,1);
    if(['success','live'].includes(mode)){
     assert.equal(transcript.model,'gpt-live-transcribe');assert.equal(stats().fallback,0);
     assert.ok(events.some((e:any)=>e.kind==='transcription-partial'&&e.time<releasedAt),'partial before release');
    }else assert.equal(stats().fallback,1,'one file fallback');
    report.cases.push({mode,transcript,releaseToCommandMs:events.find((e:any)=>e.kind==='input'&&e.source==='microphone').time-releasedAt,stats:stats()});
    if(mode==='success'){
     // A second turn uses its own item and cannot receive the first turn's final.
     await page.keyboard.down('Space');await page.waitForTimeout(2300);await page.keyboard.up('Space');
     await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='command-complete'&&e.action==='resume'));
     assert.equal(stats().connections,2);assert.equal(stats().commits,2);assert.equal(stats().fallback,0);assert.ok(stats().nonzero);
    }
   }
   assert.deepEqual(stats().errors,[]);report.checks.push(mode);console.log(mode,JSON.stringify(stats()));
   if(mode==='live')await page.screenshot({path:`${dir}/live.png`});
  }catch(error){report.cases.push({mode,error:String(error),stats:stats(),events:await page.evaluate(()=>(window as any).cinco?.events),status:await page.locator('.command-status').innerText(),errorText:await page.locator('.command-error').innerText()});throw error;}finally{await page.close();}
 }
}finally{await browser.close();await fs.writeFile(`${dir}/${process.argv.includes('--supersede-only')?'supersede':process.argv.includes('--compare')?'comparison':process.argv.includes('--only-live')?'live':'report'}.json`,JSON.stringify(report,null,2)+'\n');}
console.log('Streaming transcription checks passed.');
