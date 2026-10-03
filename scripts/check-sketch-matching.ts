import assert from 'node:assert/strict';
import {scripted,sketch} from '../src/protocol.ts';
const c={identity:'Thomas',character:'tayne',pending:'nsfw',history:[]};
for(const s of ['Mm-hmm.','M-hm','mhm','hmm','uh huh','um hum','yeah','yes please','Computer, mm hmm'])assert.equal(scripted(s,c)?.action,'confirm',s);
for(const s of ['no','nope','not now','uh uh','mm mm','cancel'])assert.equal(scripted(s,c)?.action,'cancel',s);
for(const s of ['yes but no','yes do not do that','uh I am not sure'])assert.notEqual(scripted(s,c)?.action,'confirm',s);
assert.notEqual(scripted('mm-hmm',{...c,pending:''})?.action,'confirm');
const context={...c,pending:''};for(const step of sketch){const cmd=scripted(step.text,context);assert.equal(cmd?.action,step.action,step.text);if(cmd?.action==='beta')context.pending='beta';else if(cmd?.action==='repeat')context.pending='repeat';else if(cmd?.action==='nsfw')context.pending='nsfw';else if(cmd?.action!=='reaction')context.pending='';}
console.log('Exact sketch sequence and 19 confirmation variants/context checks passed');
