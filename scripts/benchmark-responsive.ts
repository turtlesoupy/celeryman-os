import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const dir='benchmarks/responsiveness';await fs.mkdir(dir,{recursive:true});
await fs.mkdir('analysis',{recursive:true});
execFileSync('say',['-v','Samantha','-r','165','-o','analysis/friend-command.aiff','Computer, show me a shoulder shimmy in a mustard yellow tracksuit.']);
execFileSync('ffmpeg',['-y','-i','analysis/friend-command.aiff','-ar','48000','-ac','1','analysis/friend-command.wav','-loglevel','error']);
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',`--use-file-for-fake-audio-capture=${process.cwd()}/analysis/friend-command.wav`]});
const page=await browser.newPage({permissions:['microphone']});
const report:any={date:new Date().toISOString(),checks:[],commands:[],errors:[]};
page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173');
 const picker=page.waitForEvent('filechooser');await page.getByLabel('Identity',{exact:true}).selectOption('upload');await(await picker).setFiles('reference/thomas-dimson.jpg');
 await page.waitForFunction(()=>(window as any).cinco.state().profile.length>20);
 await page.getByLabel('Your name',{exact:true}).fill('Thomas');await page.getByText('Start computer',{exact:true}).click();
 await page.waitForFunction(()=>(window as any).cinco.events.some((e:any)=>e.kind==='audio-playing'));
 await page.waitForTimeout(4500);
 report.profile=await page.evaluate(()=>(window as any).cinco.state().profile);
 const commands=['Computer, show me a shoulder shimmy in a mustard yellow tracksuit.','Now give him a tiny backwards shuffle while keeping the yellow tracksuit.','Could I see a hat wobble, but wearing a tall purple top hat and wobbling twice as slowly?'];
 await page.evaluate(()=>(window as any).cinco.startOutputCapture());
 for(const text of commands){
  const timing=await page.evaluate(async text=>{const c=(window as any).cinco,start=performance.now(),n=c.events.length;await c.dispatch(text);return {wallMs:performance.now()-start,events:c.events.slice(n)};},text);
  const video=page.locator('.custom-dancer video').last();await video.evaluate((v:HTMLVideoElement)=>v.play());
  const firstFrameTime=await video.evaluate(()=>performance.now());
  const latency={text,...timing,firstFrameMs:firstFrameTime-timing.events.find((e:any)=>e.kind==='input').time,acknowledgementMs:timing.events.find((e:any)=>e.kind==='audio-playing')?.time-timing.events.find((e:any)=>e.kind==='input')?.time};
  report.commands.push(latency);console.log(JSON.stringify({text,ms:latency.wallMs,ackMs:latency.acknowledgementMs,generation:timing.events.find((e:any)=>e.kind==='generated-ready')?.timings}));
  await page.waitForTimeout(750);await page.screenshot({path:`${dir}/${report.commands.length}.png`});
 }
 // Exercise the real MediaRecorder + transcription path after keyboard commands.
 const beforeMic=await page.evaluate(()=>(window as any).cinco.events.length);
 await page.keyboard.down('Space');await page.waitForTimeout(Number(execFileSync('ffprobe',['-v','quiet','-show_entries','format=duration','-of','csv=p=0','analysis/friend-command.wav']).toString())*1000+300);
 const releasedAt=await page.evaluate(()=>performance.now());await page.keyboard.up('Space');
 await page.waitForFunction(n=>(window as any).cinco.events.slice(n).some((e:any)=>e.kind==='command-complete'),beforeMic,{timeout:60000});
 report.microphone=await page.evaluate(({n,releasedAt})=>{const events=(window as any).cinco.events.slice(n);return {events,speechEndToAckMs:events.find((e:any)=>e.kind==='audio-playing')?.time-releasedAt,speechEndToReadyMs:events.find((e:any)=>e.kind==='generated-ready')?.time-releasedAt};},{n:beforeMic,releasedAt});
 report.checks.push({name:'real-microphone-transcription-and-generation',pass:report.microphone.events.some((e:any)=>e.kind==='input'&&e.source==='microphone')&&report.microphone.speechEndToAckMs<2500&&report.microphone.speechEndToReadyMs<10000});
 // Let the final generated soundtrack cross its loop boundary several times.
 await page.waitForTimeout(15000);
 report.beforeSpeech=await page.evaluate(()=>(window as any).cinco.state().music);
 await page.evaluate(()=>(window as any).cinco.dispatch('Computer?'));await page.waitForTimeout(80);
 await page.keyboard.down('Space');await page.waitForTimeout(100);
 report.interrupted=await page.evaluate(()=>(window as any).cinco.state());
 // Skip microphone transcription for this deliberately silent interruption test.
 await page.route('**/api/transcribe',route=>route.fulfill({json:{text:''}}));await page.keyboard.up('Space');
 await page.evaluate(()=>(window as any).cinco.dispatch('pause'));await page.waitForTimeout(100);
 report.paused=await page.evaluate(()=>(window as any).cinco.state().music);
 await page.evaluate(()=>(window as any).cinco.dispatch('resume'));await page.waitForTimeout(2500);
 report.resumed=await page.evaluate(()=>(window as any).cinco.state().music);
 const audio=await page.evaluate(()=>(window as any).cinco.stopOutputCapture());await fs.writeFile(`${dir}/output.webm`,Buffer.from(audio,'base64'));
 report.checks.push({name:'instant-recorded-acknowledgement',pass:report.commands.every((c:any)=>c.acknowledgementMs<250)});
 report.checks.push({name:'fresh-generated-dance-under-eight-seconds',pass:report.commands.every((c:any)=>c.firstFrameMs<8000)});
 report.checks.push({name:'interrupted-speech-restores-music',pass:report.interrupted.music.volume===.6&&report.interrupted.ducks.length===0});
 report.checks.push({name:'pause-resume-keeps-loop',pass:!report.paused.playing&&report.resumed.playing&&report.resumed.volume===.6});
 report.events=await page.evaluate(()=>(window as any).cinco.events);
 report.checks.push({name:'no-runtime-errors',pass:report.errors.length===0&&!report.events.some((e:any)=>/error/.test(e.kind))});
}catch(e){report.errors.push(String(e));}finally{await fs.writeFile(`${dir}/report.json`,JSON.stringify(report,null,2));await browser.close();}
console.log(JSON.stringify({checks:report.checks,errors:report.errors},null,2));if(report.errors.length||report.checks.some((c:any)=>!c.pass))process.exitCode=1;
