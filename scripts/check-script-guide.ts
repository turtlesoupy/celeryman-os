import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();await page.addInitScript('window.__name = value => value;');
 await page.route('**/guide-check',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><main></main>'}));
 await page.goto('http://127.0.0.1:5173/guide-check');
 for(const name of ['Tayne','Tayna','Tain','Tane']){
  const result=await page.evaluate(async name=>{
   const {createScriptGuide}=await import('/src/script-guide.ts');
   const {scripted}=await import('/src/protocol.ts');
   const host=document.querySelector('main')!;host.replaceChildren();
   const guide=createScriptGuide(host),quote=()=>host.querySelector('.script-guide-quote')!.textContent;
   guide.observe('All right.','tayne');const before=quote();
   guide.observe('That looks great.','reaction');const unrelated=quote();
   const text=`Now ${name} I can get into.`;
   const command=scripted(text,{identity:'Tommy',character:'tayne',pending:'',history:[]});
   if(command)guide.observe(text,command.action);
   return {before,unrelated,after:quote(),action:command?.action};
  },name);
  assert.match(result.before!,/Now Tayne.*hat wobble/);assert.equal(result.unrelated,result.before);
  assert.equal(result.action,'reaction');assert.match(result.after!,/hat wobble/);
 }
 const mergedHat=await page.evaluate(async()=>{
  const {createScriptGuide}=await import('/src/script-guide.ts');const {scripted}=await import('/src/protocol.ts');const host=document.querySelector('main')!;host.replaceChildren();const guide=createScriptGuide(host);guide.observe('All right.','tayne');
  const text='Now Tayne I can get into. Can I see a hat wobble?';const cmd=scripted(text,{identity:'Tommy',character:'tayne',pending:'',history:[]});if(cmd)guide.observe(text,cmd.action);return {action:cmd?.action,next:host.textContent};
 });
 assert.equal(mergedHat.action,'hat');assert.match(mergedHat.next!,/flarhgunnstow/);
 const phone=await page.evaluate(async()=>{
  const {createScriptGuide}=await import('/src/script-guide.ts');const {scripted}=await import('/src/protocol.ts');
  const host=document.querySelector('main')!;host.replaceChildren();const guide=createScriptGuide(host);
  guide.observe('Mm-hmm.','confirm');const before=host.textContent;const text="Oh shit! I'm okay.";
  const cmd=scripted(text,{identity:'Tommy',character:'tayne',pending:'',history:[]});if(cmd)guide.observe(text,cmd.action);
  return {before,after:host.textContent,index:guide.nextIndex()};
 });
 assert.match(phone.before!,/Oh shit! I'm okay/);assert.match(phone.after!,/I'll get it later/);assert.equal(phone.index,16);
 console.log('Passed: Tayne transcription variants advance to hat wobble; unrelated reactions do not skip the guide.');
}finally{await browser.close();}
