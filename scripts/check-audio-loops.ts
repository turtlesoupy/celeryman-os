import {chromium} from 'playwright';import fs from 'node:fs/promises';
const dir='benchmarks/responsiveness';await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--autoplay-policy=user-gesture-required']});const page=await browser.newPage();
const results:any={checks:[],errors:[]};page.on('pageerror',e=>results.errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173');await page.getByText('Start computer',{exact:true}).click();
 await page.evaluate(async()=>{const c=(window as any).cinco;c.setMode('reference');await c.apply({action:'celery',response:''});});
 await page.waitForFunction(()=>(window as any).cinco.state().music?.playing);await page.waitForTimeout(4500);
 for(const character of ['celery','oyster']){
  if(character==='oyster')await page.evaluate(()=>(window as any).cinco.apply({action:'oyster',response:''}));
  await page.waitForTimeout(500);const state=await page.evaluate(()=>(window as any).cinco.state().music);
  await page.evaluate(()=>(window as any).cinco.startOutputCapture());await page.waitForTimeout(12000);
  const audio=await page.evaluate(()=>(window as any).cinco.stopOutputCapture());await fs.writeFile(`${dir}/loop-${character}.webm`,Buffer.from(audio,'base64'));
  results.checks.push({name:`${character}-continuous-playback`,pass:state.playing&&state.volume===.6,duration:state.duration});
 }
 // An unavailable voice must release the duck, as must mute and unmute.
 await page.route('**/media/original/missing-test.wav',r=>r.fulfill({status:404,body:'missing'}));
 await page.evaluate(()=>(window as any).cinco.apply({action:'attention',response:'Missing',audio:'missing-test'}));await page.waitForTimeout(300);
 results.checks.push({name:'failed-voice-restores-volume',pass:await page.evaluate(()=>(window as any).cinco.state().music.volume===.6)});
 await page.evaluate(()=>(window as any).cinco.setSound(false));await page.waitForTimeout(200);
 results.checks.push({name:'mute',pass:await page.evaluate(()=>(window as any).cinco.state().music.volume===0)});
 await page.evaluate(()=>(window as any).cinco.setSound(true));
 results.checks.push({name:'unmute',pass:await page.evaluate(()=>(window as any).cinco.state().music.volume===.6)});
}finally{await browser.close();await fs.writeFile(`${dir}/audio-controls.json`,JSON.stringify(results,null,2));}
console.log(results);if(results.checks.some((r:any)=>!r.pass)||results.errors.length)process.exitCode=1;
