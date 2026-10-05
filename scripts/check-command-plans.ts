import assert from 'node:assert/strict';
import {requestsPerformance,commandPlanFormat,validateCommandPlan} from '../server/command-plan.ts';
import {costumeFrameKey} from '../server/costume-frame.ts';
for(const text of ['Load up carrot man please','Computer, load up carrot man, please.','Could you show me a tiny backwards shuffle?','Make the hat wobble more slowly']){
 assert.ok(requestsPerformance(text),text);
 assert.deepEqual(commandPlanFormat(text).json_schema.schema.properties.action.enum,['custom']);
 assert.throws(()=>validateCommandPlan({action:'reaction'},text));
 assert.throws(()=>validateCommandPlan({action:'custom',costume:'',motion:'dance',label:'CARROT'},text));
}
for(const text of ['That is great','Thanks','Oh wow'])assert.ok(!requestsPerformance(text),text);
const key=(profile:string,costume:string,variant:string,closeup=false,smile=false)=>costumeFrameKey(profile,costume,closeup,variant,smile);
assert.equal(key('a','suit','celery'),key('a','suit','engaged'));
assert.equal(key('a','silk shirt','tayne'),key('a','silk shirt','sway'));
assert.equal(key('a','silk shirt','tayne'),key('a','silk shirt','flarhgunnstow'));
assert.notEqual(key('a','suit','celery'),key('b','suit','celery'));
assert.notEqual(key('a','suit','celery'),key('a','red hoodie','celery'));
assert.notEqual(key('a','suit','celery'),key('a','suit','celery-face',true));
assert.notEqual(key('a','suit','celery-face',true),key('a','suit','celery-face',true,true));
console.log('Performance intent, no-op rejection, costume reuse and identity/cache isolation checks passed');
