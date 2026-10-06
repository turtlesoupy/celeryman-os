import {commandText} from '../src/command-text.ts';
// The sketch parser runs first. An unfamiliar named performance is still a
// rendering request, even if the planner has never heard its character name.
export function requestsPerformance(text:string){
 const t=commandText(text).replace(/^computer /,'').replace(/^please /,'');
 return /^(?:load(?: up)?|run|start|add(?: sequence)?|show(?: me)?|create|generate|make)\b/.test(t)
  || /^(?:(?:can|could|would) you (?:please )?(?:load|show|make|create|generate)|(?:can|could) i (?:see|have)|i (?:want|would like) (?:to see )?)/.test(t);
}
export function commandPlanFormat(text:string,custom=false){
 return {type:'json_schema' as const,json_schema:{name:'dance_command',strict:true,schema:{type:'object',additionalProperties:false,properties:{
  action:{type:'string',enum:(custom||requestsPerformance(text))?['custom']:['reaction','custom','engage','print','beta','pause','resume','chaos']},
  costume:{type:'string'},motion:{type:'string'},label:{type:'string'},response:{type:'string'}},required:['action','costume','motion','label','response']}}};
}
export function validateCommandPlan(plan:any,text:string,custom=false){
 if((custom||requestsPerformance(text))&&plan.action!=='custom')throw Error('The computer did not plan a dance for this request. Please try again.');
 if(plan.action==='custom'&&['costume','motion','label'].some(key=>typeof plan[key]!=='string'||!plan[key].trim()))throw Error('The computer returned an incomplete dance plan. Please try again.');
 return plan;
}
