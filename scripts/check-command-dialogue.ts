// Pitch, acceptance, modification and cancellation through /api/command without generating media.
import assert from 'node:assert/strict';
import {scripted,sketch,type Context} from '../src/protocol.ts';
import {advanceDirector,emptyDirector} from '../src/director.ts';
const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:5173';
const context:Context={identity:'Tommy',character:'celery',costume:'gray suit, white shirt, black shoes',pending:'',history:[],conversation:[],scriptStep:sketch.length,director:emptyDirector()};
async function command(text:string){const r=await fetch(`${origin}/api/command`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({text,context})});const result=await r.json();assert(r.ok,JSON.stringify(result));return result;}
assert.equal(scripted('Do you have a new sequence involving a robot?',context),null);
const question='Can you suggest a brand new robot character with a silver suit?';
const proposal=await command(question);assert.equal(proposal.beat?.kind,'pitch');assert.match(proposal.response,/\?$/);assert(!proposal.generationId);console.log('pitch',proposal.response);
context.conversation=[{role:'user',content:question},{role:'assistant',content:proposal.response}];context.director=advanceDirector(context.director,proposal,context);
const accepted=await command('Yes, show me, but make it shinier');assert.equal(accepted.action,'custom');assert.equal(accepted.sequenceMode,'new');assert.match(accepted.costume,/silver|metal|robot|chrome/i);console.log('accepted',accepted.label,accepted.costume);
context.director=emptyDirector();context.conversation=[];
const modify=await command('Add a backward shuffle to this, keep his outfit');assert.equal(modify.action,'custom');assert.equal(modify.sequenceMode,'modify');assert.equal(modify.target,'celery');assert.match(modify.costume,/gray|grey/i);console.log('modify',modify.motion);
context.director={...emptyDirector(),offer:proposal.beat.offer};const cancel=await command('No thanks');assert.equal(cancel.action,'cancel');assert(!cancel.generationId);
console.log('Passed pitch, acceptance with changes, modification, cancellation; no media generation requested.');
