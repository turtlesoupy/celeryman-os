import 'dotenv/config';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import {routeIntent} from '../server/intent-router.ts';
const client=new OpenAI({maxRetries:0}),context={identity:'Big boy',character:'celery',pending:'',history:[],scriptStep:2};
for(const [text,expected] of [
 ['Did you pick up the 43D3D3?','engage'],
 ['Could you kick up the four dee three dee?','engage'],
 ['Turn on the 3D3D3D','engage'],
 ['Do not kick up the 43D3D3','reaction'],
 ['What does 4d3d3d3 mean?','dialogue'],
 ['Give him a new purple suit and a shuffle','modify_current']]){
 const route=await routeIntent(client,text,context);console.log(text,route.intent);assert.equal(route.intent,expected);
}
// Recovery must also work after the erroneous clarification question.
const recovery=await routeIntent(client,'Did you pick up the 43D3D3?',{...context,pending:'dialogue',conversation:[{role:'assistant',content:'What move do you mean by 43D3D3?'}]});assert.equal(recovery.command?.action,'engage');
console.log('Passed engage transcription variants, negation, explanation, custom move and clarification recovery.');
