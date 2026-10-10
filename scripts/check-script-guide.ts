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
 // After the sketch: answer what the computer is waiting on, then untried features, never cycling.
 const encore=await page.evaluate(async()=>{
  const {createScriptGuide}=await import('/src/script-guide.ts');const {sketch}=await import('/src/protocol.ts');
  const {emptyDirector,resolveLocally}=await import('/src/director.ts');
  const host=document.querySelector('main')!;host.replaceChildren();const guide=createScriptGuide(host),quote=()=>host.querySelector('.script-guide-quote')!.textContent!.replace(/[“”]/g,'');
  for(const line of sketch)guide.observe(line.text,line.action);
  const offer={topic:'METS',label:'METSY',costume:'pinstripes',motion:'bat swing',introLine:'Hi.'},taboo={kind:'evil' as const,request:'Make him evil.'};
  const d=(over={})=>({...emptyDirector(),...over}),seen:string[]=[quote()],answers:Record<string,string|undefined>={};
  const step=(text:string,action:any,state:any,beat?:any)=>{guide.observe(text,action,state,beat);seen.push(quote());};
  const resolves=(state:any)=>resolveLocally(quote(),{identity:'Tommy',character:'tayne',pending:'',history:[],scriptStep:sketch.length,director:state})?.beat?.kind;
  step('Show me a carrot','custom',d());
  step("What's up with the Mets?",'director',d({offer}),{kind:'pitch',offer});answers.offer=resolves(d({offer}));
  step('Yes, please.','director',d(),{kind:'reveal',offer});
  step('Make him evil.','director',d({taboo:{...taboo,stage:'repeat'}}),{kind:'taboo',stage:'repeat',taboo});answers.repeat=resolves(d({taboo:{...taboo,stage:'repeat'}}));
  step('Make him evil.','director',d({taboo:{...taboo,stage:'warn'}}),{kind:'taboo',stage:'warn',taboo});answers.warn=resolves(d({taboo:{...taboo,stage:'warn'}}));
  step('Yes.','director',d({armed:true}),{kind:'taboo',stage:'reveal',taboo});
  step('Oh, nice.','director',d({call:{caller:'HR',rings:1}}),{kind:'call',caller:'HR',rings:1});answers.call=resolves(d({call:{caller:'HR',rings:1}}));
  step('Put them through.','director',d(),{kind:'answer',caller:'HR'});
  step('Turn on turbo mode.','director',d(),{kind:'mode',name:'TURBO',effect:'turbo'});
  step('Nice.','reaction',d());
  return {seen,answers};
 });
 assert.deepEqual(encore.seen,['Computer, show me a new sequence.',"What's up with the Mets?",'Yes, please.','Make him evil.','Make him evil.','Yes.','Oh, nice.','Put them through.','Turn on turbo mode.','Computer, show me a new sequence.','Computer, show me a new sequence.']);
 assert.deepEqual(encore.answers,{offer:'reveal',repeat:'taboo',warn:'taboo',call:'answer'},'Each suggested answer is one the director accepts');
 console.log('Passed: Tayne transcription variants advance to hat wobble; unrelated reactions do not skip the guide; post-sketch suggestions answer pending questions and never cycle.');
}finally{await browser.close();}
