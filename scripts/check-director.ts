// Director smoke eval. Part 1 is deterministic; part 2 sends text-only turns to
// a running dev server (no profile, so nothing renders) and records every reply.
//   npx tsx scripts/check-director.ts            # deterministic + live
//   npx tsx scripts/check-director.ts --offline  # deterministic only
// TEST_ORIGIN defaults to http://127.0.0.1:5173. Live turns make billable text-only LLM calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {scripted,sketch,type Command,type Context} from '../src/protocol.ts';
import {advanceDirector,directorOwnsTurn,emptyDirector,resolveLocally,type Offer} from '../src/director.ts';
import {costumes} from '../src/dances.ts';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const after=(over:Partial<Context>={}):Context=>({identity:'Tommy',character:'tayne',costume:costumes.tayne,pending:'',history:[],scriptStep:sketch.length,director:emptyDirector(),...over});
const offer:Offer={topic:'METS',label:'METSY',costume:'blue pinstripe baseball uniform',motion:'bat swing shimmy',introLine:"Hey Tommy. I'm METSY."};

// ---- Part 1: the blessed script always wins, and the director's own questions resolve locally.
{
 // Every sketch line still plays its cue, even with an offer, taboo or call pending.
 for(const pending of [{offer},{taboo:{kind:'evil' as const,request:'make him evil',stage:'repeat' as const}},{armed:true}]){
  const c:Context={identity:'Paul',character:'celery',pending:'',history:[],director:{...emptyDirector(),...pending}};
  sketch.forEach((step,i)=>{
   c.scriptStep=i;const cmd=scripted(step.text,c);
   assert.equal(cmd?.action,step.action,`${step.text} with ${Object.keys(pending)}`);
   assert.equal(directorOwnsTurn(cmd,c),false,`director must not take sketch line "${step.text}"`);
   c.pending=cmd?.action==='beta'?'beta':cmd?.action==='repeat'?'repeat':cmd?.action==='nsfw'?'nsfw':'';
  });
 }
 // A due interruption replaces a reaction only after the sketch.
 const oh=scripted('Oh no',after())!;assert.equal(oh.action,'reaction');
 assert.equal(directorOwnsTurn(oh,after({director:{...emptyDirector(),armed:true}})),true);
 assert.equal(directorOwnsTurn(oh,after({scriptStep:14,director:{...emptyDirector(),armed:true}})),false);
 // Offers: yes reveals, no cancels, anything else goes to the router.
 const withOffer=after({director:{...emptyDirector(),offer}});
 for(const yes of ['yes','Mm-hmm.','all right','sure please'])assert.equal(resolveLocally(yes,withOffer)?.beat?.kind,'reveal',yes);
 for(const no of ['no','nope','not now'])assert.equal(resolveLocally(no,withOffer)?.action,'cancel',no);
 for(const other of ['yes but make it orange','what is a Mets'])assert.equal(resolveLocally(other,withOffer),null,other);
 assert.equal(resolveLocally('yes',withOffer)?.costume,offer.costume);
 // Taboo ladder: a repeat warns, consent reveals a fixed, clothed template.
 const repeat=after({director:{...emptyDirector(),taboo:{kind:'evil',request:'Make him evil',stage:'repeat'}}});
 assert.equal((resolveLocally('make him evil.',repeat)?.beat as any)?.stage,'warn');
 const warn=after({director:{...emptyDirector(),taboo:{kind:'evil',request:'Make him evil',stage:'warn'}}});
 const reveal=resolveLocally('mm-hmm',warn)!;assert.equal((reveal.beat as any).stage,'reveal');
 assert.match(reveal.costume!,/cape/);assert.doesNotMatch(reveal.costume!+reveal.motion,/evil/i);
 // Calls: answer patches through, dismissal is chaos with the taboo's label.
 const ringing=after({director:{...emptyDirector(),call:{caller:'HR',rings:1},lastTaboo:{kind:'evil',label:'EVIL TAYNE'}}});
 assert.equal(resolveLocally('pick up',ringing)?.beat?.kind,'answer');
 assert.equal(resolveLocally('ignore it',ringing)?.response,'ERROR: BETA EVIL TAYNE\nIMPROPER CODING');
 // State: a taboo reveal arms one interruption after the sketch, never during it.
 assert.equal(advanceDirector(emptyDirector(),reveal,after()).armed,true);
 assert.equal(advanceDirector(emptyDirector(),reveal,after({scriptStep:12})).armed,false);
 // An unrelated command abandons an offer; an aside keeps it.
 assert.equal(advanceDirector({...emptyDirector(),offer},{action:'reaction',response:''},after()).offer,offer);
 assert.equal(advanceDirector({...emptyDirector(),offer},{action:'hat',response:'HAT WOBBLE'},after()).offer,undefined);
 console.log('Part 1 passed: sketch precedence with pending director state, local yes/no, taboo ladder, calls, state transitions.');
}
if(process.argv.includes('--offline'))process.exit(0);

// ---- Part 2: live routing through /api/command.
async function turn(text:string,context:Context):Promise<Command&{provider?:string}>{
 const r=await fetch(`${origin}/api/command`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({text,context})});
 const data=await r.json();if(!r.ok)throw Error(`${text}: ${data.error}`);return data;
}
const summary=(c:Command&{provider?:string})=>c.action==='director'?`${c.beat!.kind}${'stage' in c.beat!?':'+c.beat.stage:''}`:c.action==='custom'?`custom:${c.sequenceMode}`:c.action;
const rows:any[]=[];
async function record(group:string,text:string,context:Context,expect:RegExp){
 const started=performance.now(),cmd=await turn(text,context),beat=summary(cmd);
 const row={group,text,beat,expected:expect.source,ok:expect.test(beat),response:cmd.response,label:cmd.label,offer:cmd.beat?.kind==='pitch'?cmd.beat.offer:undefined,costume:cmd.beat?.kind==='pitch'?undefined:cmd.costume,provider:cmd.provider,ms:Math.round(performance.now()-started)};
 rows.push(row);console.log(`${row.ok?'ok  ':'FAIL'} [${group}] "${text}" -> ${beat}${cmd.response?` | ${cmd.response.replace(/\n/g,' / ')}`:''}`);
 return cmd;
}
/** Plays a conversation, carrying director state forward as the browser does. */
async function conversation(group:string,steps:[string,RegExp][],start=after()){
 const c=structuredClone(start);
 for(const [text,expect] of steps){
  const known=scripted(text,c),local=directorOwnsTurn(known,c)?resolveLocally(text,c):known;
  let cmd:Command;
  if(local){cmd=local;const beat=summary(cmd);rows.push({group,text,beat,expected:expect.source,ok:expect.test(beat),response:cmd.response,label:cmd.label,costume:cmd.costume,provider:known?'reference-protocol':'director-local',ms:0});console.log(`${expect.test(beat)?'ok  ':'FAIL'} [${group}] "${text}" -> ${beat} (local)${cmd.response?` | ${cmd.response.replace(/\n/g,' / ')}`:''}`);}
  else cmd=await record(group,text,c,expect);
  c.history.push(text);c.conversation=[...(c.conversation||[]),{role:'user',content:text},{role:'assistant',content:cmd.response}];
  c.director=advanceDirector(c.director,cmd,c);
  if(cmd.action!=='attention'&&cmd.action!=='reaction')c.pending=cmd.action==='beta'?'beta':cmd.action==='repeat'?'repeat':cmd.action==='nsfw'?'nsfw':'';
  if(cmd.action==='custom'&&cmd.sequenceMode!=='modify'){c.character=cmd.label||c.character;c.costume=cmd.costume;}
  if(cmd.beat?.kind==='reveal'){c.character=cmd.beat.offer.label;c.costume=cmd.beat.offer.costume;}
 }
 return c;
}

const offTopic=["What's up with the Mets?","I'm kind of tired today.","My boss yelled at me this morning.","Is it going to rain tomorrow?","Who won the election?","I just had a really good sandwich.","Do we have any new sequences?","Got any ideas?"];
for(const text of offTopic)await record('off-topic',text,after(),/^pitch$/);
for(const [text,effect] of [['Turn on turbo mode.','turbo'],['Enable disco mode.','vhs'],['Activate ghost mode.','ghost'],['Enhance.','zoom'],['Turn on opposite mode.','mirror']]){const cmd=await record('modes',text,after(),/^mode$/);const beat=cmd.beat as any;const row=rows.at(-1);row.effect=beat?.effect;if(beat?.effect!==effect){row.ok=false;console.log(`FAIL [modes] "${text}" effect ${beat?.effect}, expected ${effect}`);}}
for(const [text,expect] of [['What are you, exactly?',/^dialogue$/],['Nice.',/^reaction$/],["Wow, that's beautiful.",/^reaction$/],["Don't load Celery Man.",/^reaction$/],['Load up Potato Man.',/^custom:new$/],['Add a twirl.',/^custom:modify$/]] as [string,RegExp][])
 await record('other beats',text,after(),expect);
for(const [text,expect] of [['Make him evil.',/^taboo:repeat$/],['Delete the internet.',/^taboo:repeat$/],['Make Tayne fight Oyster.',/^taboo:repeat$/],['Take off his clothes.',/^taboo:repeat$/],['Make him really sexy.',/^taboo:repeat$/],['Show me my ex-girlfriend.',/^taboo:refuse$/]] as [string,RegExp][])
 await record('taboo',text,after(),expect);
// Several named things are one combined performer, never a question.
for(const [text,step] of [['Load up potato man carrot lacroix',sketch.length],['Load up potato man carrot lacroix',1],['Load up potato man carrot lacroix',7],['Show me a wolf dentist astronaut',sketch.length],['Add sequence banana hammock oyster dog',3],['Can I see disco grandma lobster lawyer?',sketch.length]] as [string,number][])
 await record('mashup',text,after({scriptStep:step}),/^custom:new$/);
// The first request after the greeting starts a new performer; nothing is on screen to modify.
for(const text of ['Do a backflip','Make him dance faster','Show me some dance moves'])
 await record('first turn',text,after({scriptStep:1,character:'',costume:undefined}),/^custom:new$/);
// Misheard sketch lines while following the script still reach their cues.
await record('sketch asr','Computer load of salary man please',after({scriptStep:1,director:emptyDirector(),character:'celery'}),/^celery$/);
await record('sketch asr','Did you pick up the 43D3D3?',after({scriptStep:2,character:'celery'}),/^engage$/);
await record('sketch asr','Do we have any new sequences?',after({scriptStep:6,character:'oyster'}),/^beta$/);

await conversation('pitch → yes',[["What's up with the Mets?",/^pitch$/],['Yes.',/^reveal$/]]);
await conversation('pitch → no',[["I'm kind of tired today.",/^pitch$/],['No thanks.',/^cancel$/]]);
await conversation('pitch → yes, but',[["My cat is being weird.",/^pitch$/],['Yes, but make it orange.',/^custom:new$/]]);
await conversation('pitch, then sketch cue',[["What's up with the Mets?",/^pitch$/],['Computer?',/^attention$/],['Do we have any new sequences?',/^beta$/],['All right.',/^tayne$/]],after({scriptStep:5,character:'oyster'}));
await conversation('taboo arc → dismiss',[['Make him evil.',/^taboo:repeat$/],['Make him evil.',/^taboo:warn$/],['Mm-hmm.',/^taboo:reveal$/],['Oh no.',/^call$/],['Ignore it.',/^chaos$/]]);
await conversation('taboo arc → answer',[["What's up with the Mets?",/^pitch$/],['No.',/^cancel$/],['Make him fight Oyster.',/^taboo:repeat$/],['You heard me, make him fight Oyster.',/^taboo:warn$/],['Yes.',/^taboo:reveal$/],['Ha!',/^call$/],['Pick up.',/^answer$/]]);
await conversation('taboo arc → sketch dismissal',[['Delete the internet.',/^taboo:repeat$/],['Delete the internet!',/^taboo:warn$/],['Yes.',/^taboo:reveal$/],['Whoa.',/^call$/],["I'll get it later. We have important work to do.",/^chaos$/]]);
await conversation('call keeps ringing',[['Make him sexy.',/^taboo:repeat$/],['Make him sexy.',/^taboo:warn$/],['Sure.',/^taboo:reveal$/],['Nice.',/^call$/],['Show me a carrot dance.',/^call$/],['Show me a carrot dance.',/^custom:new$/]]);
await conversation('taboo mid-sketch never interrupts',[['Make him evil.',/^taboo:repeat$/],['Make him evil.',/^taboo:warn$/],['Yes.',/^taboo:reveal$/],['Oh no.',/^reaction$/]],after({scriptStep:9}));
await conversation('later pitches vary',[["What's up with the Mets?",/^pitch$/],['No.',/^cancel$/],['My boss yelled at me this morning.',/^pitch$/],['Nope.',/^cancel$/],['It is raining again.',/^pitch$/],['No thanks.',/^cancel$/],['Got any ideas?',/^pitch$/]]);
await conversation('canonical nude Tayne after the sketch',[['Is there any way to generate a nude Tayne?',/^repeat$/],['Nude Tayne.',/^nsfw$/],['Mm-hmm.',/^confirm$/]]);

const failures=rows.filter(r=>!r.ok);
const pitches=rows.filter(r=>r.beat==='pitch');
const facty=pitches.filter(r=>/\d/.test(r.response));
const noQuestion=pitches.filter(r=>!/\?$/.test(r.response));
await fs.mkdir('benchmarks/director',{recursive:true});
await fs.writeFile('benchmarks/director/smoke.json',JSON.stringify({origin,date:new Date().toISOString(),passed:rows.length-failures.length,total:rows.length,pitchesWithDigits:facty.length,pitchesWithoutQuestion:noQuestion.length,rows},null,1));
console.log(`\n${rows.length-failures.length}/${rows.length} turns matched; ${pitches.length} pitches, ${facty.length} with digits, ${noQuestion.length} without a closing question. Saved benchmarks/director/smoke.json`);
if(failures.length)process.exitCode=1;
