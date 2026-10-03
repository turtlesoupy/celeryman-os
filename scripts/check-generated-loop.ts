import {chromium} from 'playwright';import fs from 'node:fs/promises';
const report=JSON.parse(await fs.readFile('benchmarks/responsiveness/report.json','utf8'));
const url=report.commands[2].events.find((e:any)=>e.kind==='generated-ready').url;
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});const page=await browser.newPage();await page.goto('http://127.0.0.1:5173');
await page.evaluate(async url=>{const a=await import('/src/audio.ts');(window as any).loopAudio=a;(window as any).loopTest=new a.MusicLoop(url,true);await (window as any).loopTest.play();},url);
await page.waitForTimeout(200);await page.evaluate(()=>(window as any).loopAudio.startOutputCapture());await page.waitForTimeout(17000);
const audio=await page.evaluate(()=>(window as any).loopAudio.stopOutputCapture());const bytes=Buffer.from(audio,'base64');if(bytes.length<128)throw Error('Audio capture returned no frames');await fs.writeFile('benchmarks/responsiveness/loop-generated.webm',bytes);
const state=await page.evaluate(()=>(window as any).loopTest.state());await fs.writeFile('benchmarks/responsiveness/generated-loop.json',JSON.stringify(state,null,2));await browser.close();console.log(state);
