import assert from 'node:assert/strict';
import {incompleteTranscript} from '../src/transcript-quality.ts';
import {scripted} from '../src/protocol.ts';

for(const text of ['', '...', 'And please', 'and, please.', 'Please.', 'But', 'Um']){
 assert.equal(incompleteTranscript(text),true,text);
}
for(const text of ['Yes','No','Mm-hmm','Uh-uh','Please do','Oh wow','Thanks','Computer?',
 'Pause','And a flarhgunnstow?','Please load up Celery Man','Computer load up celeryman please']){
 assert.equal(incompleteTranscript(text),false,text);
}
const context={identity:'Thomas',character:'celery',pending:'',history:[]};
assert.equal(scripted('Computer load up celeryman please',context)?.action,'celery');
assert.equal(scripted('Computer, load up Celery Man, please.',context)?.action,'celery');
assert.equal(scripted('Mm-hmm',{...context,pending:'beta'})?.action,'tayne');
assert.equal(scripted('Uh-uh',{...context,pending:'beta'})?.action,'cancel');
console.log('PASS: transcript fragments, valid short replies, and the reported Celery Man command');
