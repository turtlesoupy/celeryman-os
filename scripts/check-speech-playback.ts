import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 for(const scenario of ['jitter','short','cancel','suspended','microphone-opening','cancel-during-microphone']){
  const page=await browser.newPage();
  await page.route('**/speech-check',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Speech playback test</title>'}));
  await page.goto('http://127.0.0.1:5173/speech-check');
  const result=await page.evaluate(async scenario=>{
   const {StreamingSpeech}=await import('/src/streaming-speech.ts');
   const scheduled:{at:number;duration:number;samples:number[]}[]=[];
   const original=AudioBufferSourceNode.prototype.start;
   AudioBufferSourceNode.prototype.start=function(when=0,...args:any[]){
    scheduled.push({at:when,duration:this.buffer!.duration,samples:Array.from(this.buffer!.getChannelData(0))});
    return original.call(this,when,...args);
   };
   let starts=0,ends=0,error='',summary:any,startedAt=0,completedAt=0;
   const arrivals=scenario==='short'?[0]:[0,40,80,120,620,640,660,680];
   const expected:number[]=[];
   const packets:string[]=[];
   for(let chunk=0;chunk<arrivals.length;chunk++){
    const pcm=new Uint8Array(4800),view=new DataView(pcm.buffer);
    for(let i=0;i<2400;i++){
     const value=Math.round(Math.sin((chunk*2400+i)*.13)*12000);
     view.setInt16(i*2,value,true);expected.push(value/32768);
    }
    packets.push(JSON.stringify({type:'pcm',data:btoa(String.fromCharCode(...pcm))})+'\n');
   }
   const encoder=new TextEncoder();
   window.fetch=async()=>new Response(new ReadableStream({start(controller){
    for(let i=0;i<arrivals.length;i++)setTimeout(()=>controller.enqueue(encoder.encode(packets[i])),arrivals[i]);
    setTimeout(()=>{controller.enqueue(encoder.encode('{"type":"done","cached":false}\n'));controller.close();},arrivals.at(-1)!+20);
   }}));
   // Model an output device that needs time to resume before it can accept speech.
   let beforeResume=-1;
   if(scenario==='suspended'){
    const resume=AudioContext.prototype.resume;
    AudioContext.prototype.resume=function(){
     void this.suspend();
     return new Promise<void>(resolve=>setTimeout(()=>{beforeResume=scheduled.length;void resume.call(this).then(resolve);},250));
    };
   }
   let beforeMicrophoneReady=-1;
   const speech=new StreamingSpeech('Fixture',{
    beforePlayback:scenario.includes('microphone')?()=>new Promise<void>(resolve=>setTimeout(()=>{beforeMicrophoneReady=scheduled.length;resolve();},700)):undefined,
    onStart(){starts++;startedAt=performance.now();},onEnd(){ends++;},
    onError(e:Error){error=e.message;},onComplete(value:any){summary=value;completedAt=performance.now();},
   });
   if(scenario.startsWith('cancel'))setTimeout(()=>speech.stop(),60);
   await new Promise(resolve=>setTimeout(resolve,1800));
   return {scheduled,expected,starts,ends,error,summary,startedAt,completedAt,beforeResume,beforeMicrophoneReady};
  },scenario);
  assert.equal(result.error,'',scenario);
  if(scenario.startsWith('cancel')){
   assert.equal(result.scheduled.length,0,'Cancelled speech must not schedule later packets');
   assert.equal(result.starts,0);assert.equal(result.ends,0);
  }else{
   assert.equal(result.starts,1);assert.equal(result.ends,1);assert.equal(result.summary.underruns,0);
   assert.deepEqual(result.scheduled.flatMap(s=>s.samples),result.expected,'Every PCM sample must survive buffering');
   for(let i=1;i<result.scheduled.length;i++)assert(Math.abs(result.scheduled[i].at-result.scheduled[i-1].at-result.scheduled[i-1].duration)<1e-8,'Chunks must join without gaps');
   if(scenario==='jitter')assert(result.startedAt<result.completedAt,'Stream must start before delivery completes');
   if(scenario==='microphone-opening')assert.equal(result.beforeMicrophoneReady,0,'No speech samples play while input is opening');
   if(scenario==='suspended')assert.equal(result.beforeResume,0,'Do not schedule before the audio device resumes');
  }
  console.log(`${scenario}: passed`);await page.close();
 }
}finally{await browser.close();}
