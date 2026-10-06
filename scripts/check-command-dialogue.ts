import assert from 'node:assert/strict';
import {scripted} from '../src/protocol.ts';
const context={identity:'Tommy',character:'celery',costume:'gray suit, white shirt, black shoes',pending:'',history:[],conversation:[] as {role:'user'|'assistant';content:string}[],scriptStep:6};
async function command(text:string){const r=await fetch('http://127.0.0.1:5173/api/command',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,context})});const result=await r.json();assert(r.ok,JSON.stringify(result));return result;}
assert.equal(scripted('Do you have a new sequence involving a robot?',context),null);
const question='Can you suggest a brand new robot character with a silver suit?';
const proposal=await command(question);assert.equal(proposal.action,'dialogue');assert(proposal.response);assert(!proposal.generationId);console.log('proposal',proposal);
context.pending='dialogue';context.conversation=[{role:'user',content:question},{role:'assistant',content:proposal.response}];
assert.equal(scripted('Yes, show me',context),null);
const accepted=await command('Yes, show me');assert.equal(accepted.action,'custom');assert.equal(accepted.sequenceMode,'new');assert.match(accepted.costume,/silver|metal|robot/i);console.log('accepted',accepted);
context.pending='';context.conversation=[];
const modify=await command('Add a backward shuffle to this, keep his outfit');assert.equal(modify.action,'custom');assert.equal(modify.sequenceMode,'modify');assert.equal(modify.target,'celery');assert.match(modify.costume,/gray|grey/i);console.log('modify',modify);
context.pending='dialogue';const cancel=await command('No thanks');assert.equal(cancel.action,'cancel');assert(!cancel.generationId);
console.log('Passed proposal, acceptance, modification, cancellation; no media generation requested.');
