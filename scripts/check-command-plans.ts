import assert from 'node:assert/strict';
import {requestsPerformance,commandPlanFormat,validateCommandPlan} from '../server/command-plan.ts';
import {costumeFrameKey} from '../server/costume-frame.ts';
import {scripted} from '../src/protocol.ts';
const context={identity:'Thomas',character:'celery',pending:'',history:[]};
for(const text of ['Theater, load up Celery Man please.','Computer, load up celeryman, please.','Load up Celery Man please.','A celery man, please.','Load up the Celery Man, please.'])assert.equal(scripted(text,context)?.action,'celery',text);
for(const [name,action] of [['Celery Man','celery'],['Oyster','oyster'],['Tayne','tayne']]){
 for(const request of [`Up, ${name}, please.`,`Computer, could you please load up the ${name}?`,`Please show me ${name}.`,`Can I have ${name}, please?`,`Bring up ${name}.`])assert.equal(scripted(request,context)?.action,action,request);
 for(const request of [`Do not load up ${name}.`,`${name} with both arms up`,`Load up ${name} in a celery costume`,`${name} looks funny`])assert.equal(scripted(request,context),null,request);
}
for(const name of ['Tayne','Tayna','Tain','Tane'])assert.equal(scripted(`Now ${name} I can get into.`,context)?.action,'reaction');
assert.equal(scripted('Computer,',context)?.action,'attention');
for(const text of ['No, load up Celery Man please.','Do not load Celery Man','I thought of Celery Man','Theater, load up Celery Man in a blue suit','Celery Man looks great','A celery man in a vegetable costume please','Not a celery man please'])assert.notEqual(scripted(text,context)?.action,'celery',text);
for(const text of ['Load up carrot man please','Computer, load up carrot man, please.','Theater, load up carrot man please.','Could you show me a tiny backwards shuffle?','Make the hat wobble more slowly']){
 assert.ok(requestsPerformance(text),text);
 assert.deepEqual(commandPlanFormat(text).json_schema.schema.properties.action.enum,['custom']);
 assert.throws(()=>validateCommandPlan({action:'reaction'},text));
 assert.throws(()=>validateCommandPlan({action:'custom',costume:'',motion:'dance',label:'CARROT'},text));
}
for(const text of ['That is great','Thanks','Oh wow','No, load up carrot man','Do not load carrot man'])assert.ok(!requestsPerformance(text),text);
const key=(profile:string,costume:string,variant:string,closeup=false,smile=false)=>costumeFrameKey(profile,costume,closeup,variant,smile);
assert.equal(key('a','suit','celery'),key('a','suit','engaged'));
assert.equal(key('a','silk shirt','tayne'),key('a','silk shirt','sway'));
assert.equal(key('a','silk shirt','tayne'),key('a','silk shirt','flarhgunnstow'));
assert.notEqual(key('a','suit','celery'),key('b','suit','celery'));
assert.notEqual(key('a','suit','celery'),key('a','red hoodie','celery'));
assert.notEqual(key('a','suit','celery'),key('a','suit','celery-face',true));
assert.notEqual(key('a','suit','celery-face',true),key('a','suit','celery-face',true,true));
console.log('Performance intent, no-op rejection, costume reuse and identity/cache isolation checks passed');

for(const text of ['And a flarhgunnstow?','Bargainsto?','Did a flargenstow?','And a flarginstow?'])assert.equal(scripted(text,context)?.action,'flarhgunnstow',text);
for(const text of ['Do not do a flargenstow','A flargenstow in a blue suit'])assert.notEqual(scripted(text,context)?.action,'flarhgunnstow',text);

const returning={...context,character:'WOLFMANCLAW',scriptStep:1};
for(const text of ['Computer, line up Celery Man, please.','Computer, load of Celery Man please','Computer load up salary man please'])assert.equal(scripted(text,returning)?.action,'celery',text);
for(const text of ['Computer load up Potato Boy please','Computer load up Oyster Dog please','Do not load up Celery Man please','Load up Celery Man in a blue suit','Computer load up Wolfman please'])assert.notEqual(scripted(text,returning)?.action,'celery',text);
assert.equal(scripted('Computer, load of Celery Man please',{...returning,scriptStep:3}),null,'Near-match only applies to the next cue');

assert.equal(scripted('add sequence Oyster Dog',{...context,scriptStep:3}),null,'A different named character must not be pulled into the script');
