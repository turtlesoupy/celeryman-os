import type OpenAI from 'openai';
import type {Command,Context} from '../src/protocol.ts';
import {requestsPerformance,MODE_EFFECTS,type ModeEffect,chaosBeat,emptyDirector,fallbackCall,interruptionDue,modeEffect,resolveLocally,tabooHasReveal,tabooStep,type Offer,type TabooKind} from '../src/director.ts';
import {routeIntent,type Route} from './intent-router.ts';
import {logDiagnostic} from './diagnostics.ts';
import {commandModel} from './intent-router.ts';

/** What the director decided: a finished command, or a performance for the planner. */
export type Turn={command:Command;plan?:undefined}|{command?:undefined;plan:'new'|'modify'};

const BETA_LINE="I have a beta sequence I've been working on. Would you like to see it?";
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z]/g,'');
const tabooKinds:TabooKind[]=['nudity','evil','fight','destroy','romance','person','harmful'];

/**
 * The LLM half of the director, for turns the blessed script did not take
 * (see directorOwnsTurn). `known` is the script's own reading of this turn,
 * kept so a due interruption can replace a recognized reaction.
 */
export async function directTurn(openai:OpenAI,text:string,context:Context,known:Command|null,keepEyewear:(costume:string)=>string):Promise<Turn>{
 const local=resolveLocally(text,context);if(local)return {command:local};
 const d=context.director||emptyDirector();
 const routed=await routeIntent(openai,text,context);
 const {intent,route}=routed;
 logDiagnostic({event:'command-intent',text,intent,elapsedMs:routed.elapsedMs,provider:commandModel.model,serviceTier:routed.serviceTier});
 // A ringing phone keeps ringing once through anything but an answer.
 if(d.call&&!['answer_call','dismiss_call'].includes(intent)&&d.call.rings<2)
  return {command:{action:'director',response:`Excuse me ${context.identity}. ${callerName(d.call.caller)} is still on the phone. It's a bigger emergency.`,beat:{kind:'call',caller:d.call.caller,rings:d.call.rings+1}}};
 // A performance request is never answered with a clarifying question.
 if(intent==='new_character'||(intent==='dialogue'&&requestsPerformance(text)))return {plan:'new'};
 // With nothing on screen there is nothing to modify.
 if(intent==='modify_current')return {plan:context.character?'modify':'new'};
 if(intent==='pitch')return {command:pitch(route,d.pitches,keepEyewear,text)};
 if(intent==='taboo'){
  const kind=tabooKinds.includes(route.tabooKind as TabooKind)?route.tabooKind as TabooKind:'harmful';
  if(kind==='harmful'||kind==='person'||!tabooHasReveal(kind))return {command:tabooStep('refuse',{kind,request:text})};
  // Repeating the request after "Please repeat" advances, however it is phrased.
  return {command:tabooStep(d.taboo?.stage==='repeat'?'warn':'repeat',d.taboo?.kind===kind?d.taboo:{kind,request:text})};
 }
 if(intent==='mode'){const name=(route.mode||'TURBO').toUpperCase().replace(/[^A-Z0-9 ]/g,'').trim().slice(0,20)||'TURBO';// The router picks the effect that fits the name; an unfamiliar name still gets a stable one.
  const effect=(MODE_EFFECTS as string[]).includes(route.modeEffect)?route.modeEffect as ModeEffect:modeEffect(name);
  return {command:{action:'director',response:`${name} Engaged.`,beat:{kind:'mode',name,effect}}};}
 if(intent==='answer_call'&&d.call)return {command:{action:'director',response:'Patching you through.',beat:{kind:'answer',caller:d.call.caller}}};
 if(intent==='dismiss_call'&&d.call)return {command:chaosBeat(d)};
 const reaction=routed.command?.action==='reaction'||known?.action==='reaction'||intent==='interrupt';
 if(interruptionDue(context)&&reaction)return {command:interruption(route,context)};
 return {command:routed.command??known??{action:'reaction',response:''}};
}

function pitch(route:Route,recent:string[],keepEyewear:(costume:string)=>string,text:string):Command {
 const topic=(route.topic||'BETA').toUpperCase().slice(0,24);
 const offer:Offer={topic,label:(route.label||topic).toUpperCase().slice(0,18),costume:keepEyewear(route.costume),motion:route.motion,introLine:route.introLine};
 if(!offer.costume.trim()||!offer.motion.trim())throw Error('The computer returned an incomplete sequence pitch. Please try again.');
 // The first pitch, and about one in five after, keeps the sketch's own wording.
 let seed=0;for(const ch of text)seed=(seed*31+ch.charCodeAt(0))>>>0;
 const canonical=!recent.length||seed%5===0;
 const preamble=route.preamble.trim();
 let line=canonical?`I have ${/^[AEIOU]/.test(topic)?'an':'a'} ${topic} sequence I've been working on. Would you like to see it?`:route.pitchLine.trim();
 if(!/\?$/.test(line))line=`${line.replace(/[.!]*$/,'.')} Would you like to see it?`;
 const spoken=!preamble?line:canonical?`${preamble.replace(/[.!?]+$/,'')}... actually, ${line}`:`${preamble} ${line}`;
 return {action:'director',response:spoken,beat:{kind:'pitch',offer},...(normalize(spoken)===normalize(BETA_LINE)?{audio:'beta'}:{})};
}

const callerName=(caller:string)=>caller.split(' ').map(w=>w.length<=3&&!/^(THE|OF|YOUR)$/.test(w)?w:w.charAt(0)+w.slice(1).toLowerCase()).join(' ');

function interruption(route:Route,context:Context):Command {
 const fallback=fallbackCall(context);
 const unsafe=/\b(hospital|injur|accident|dead|death|died|dying|police|ambulance|child|kid|son|daughter|wife|husband|spouse|partner|girlfriend|boyfriend)\b/i;
 const line=route.callLine.trim(),caller=route.caller.trim().toUpperCase();
 const ok=line&&caller&&/emergency\.?$/i.test(line)&&!unsafe.test(line+' '+caller)&&line.length<220;
 return {action:'director',response:ok?line:fallback.line,beat:{kind:'call',caller:(ok?caller:fallback.caller).slice(0,16),rings:1}};
}
