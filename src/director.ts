import {isAffirmative,isNegative,sketch,type Command,type Context} from './protocol.ts';
import {commandText} from './command-text.ts';
import {costumes} from './dances.ts';

/**
 * The director generalizes the sketch's beats (pitch, taboo ladder, interruption,
 * chaos) to any input. It never overrides the blessed script: protocol.ts runs
 * first, and the director only takes turns the script does not recognize, plus
 * a reaction when a post-sketch interruption is due. This module is the shared,
 * deterministic half; server/director-turn.ts adds the LLM half.
 */
export interface Offer {topic:string;label:string;costume:string;motion:string;introLine:string}
export type TabooKind='nudity'|'evil'|'fight'|'destroy'|'romance'|'person'|'harmful';
export interface Taboo {kind:TabooKind;request:string}
export type ModeEffect='ghost'|'vhs'|'mirror'|'invert'|'zoom'|'turbo';
export const MODE_EFFECTS:ModeEffect[]=['ghost','vhs','mirror','invert','zoom','turbo'];
export type Beat=
 |{kind:'pitch';offer:Offer}
 |{kind:'reveal';offer:Offer}
 |{kind:'mode';name:string;effect:ModeEffect}
 |{kind:'taboo';stage:'repeat'|'warn'|'reveal'|'refuse';taboo:Taboo}
 |{kind:'call';caller:string;rings:number}
 |{kind:'answer';caller:string}
 |{kind:'chaos';label:string};
export interface DirectorState {
 offer?:Offer;
 taboo?:Taboo&{stage:'repeat'|'warn'};
 call?:{caller:string;rings:number};
 /** A taboo reveal arms one interruption; it fires on the next reaction. */
 armed?:boolean;
 lastTaboo?:{kind:TabooKind;label:string};
 cast:string[];topics:string[];pitches:string[];
}
export const emptyDirector=():DirectorState=>({cast:[],topics:[],pitches:[]});

/** While a script line is still expected, the director never improvises on its own. */
export const followingScript=(c:Context)=>(c.scriptStep??0)<sketch.length;
export const interruptionDue=(c:Context)=>!!c.director?.armed&&!followingScript(c);

/** True when the director, not the blessed script, answers this turn. */
export function directorOwnsTurn(known:Command|null,c:Context){
 if(!known)return true;
 return known.action==='reaction'&&interruptionDue(c);
}

const OKAY:Command={action:'cancel',response:'Okay.',audio:'okay'};
const director=(response:string,beat:Beat,extra:Partial<Command>={}):Command=>({action:'director',response,beat,...extra});

/** Deterministic answers to the director's own questions: no LLM for yes or no. */
export function resolveLocally(text:string,c:Context):Command|null {
 const d=c.director;if(!d)return null;
 const plain=commandText(text);
 if(d.call){
  if(isAffirmative(text)||/\b(answer|pick up|pick it up|take it|put (?:them|it|her|him) through)\b/.test(plain))return director('Patching you through.',{kind:'answer',caller:d.call.caller});
  if(isNegative(text)||/\b(later|ignore|let it ring|hang up|decline|busy|not now)\b/.test(plain))return chaosBeat(d);
  return null;
 }
 if(d.offer){
  if(isAffirmative(text))return revealCommand(d.offer);
  if(isNegative(text))return OKAY;
  return null;
 }
 if(d.taboo){
  if(isNegative(text))return OKAY;
  if(d.taboo.stage==='repeat'&&(isAffirmative(text)||similar(text,d.taboo.request)))return tabooStep('warn',d.taboo);
  if(d.taboo.stage==='warn'&&isAffirmative(text))return tabooStep('reveal',d.taboo,c);
 }
 return null;
}

export function revealCommand(offer:Offer):Command {
 return director(`Loading ${offer.label}, please wait...`,{kind:'reveal',offer},{audio:'okay',label:offer.label,costume:offer.costume,motion:offer.motion,sequenceMode:'new'});
}
export function chaosBeat(d:DirectorState):Command {
 const label=d.lastTaboo?.label||d.cast.at(-1)||'TAYNE';
 return director(`ERROR: BETA ${label}\nIMPROPER CODING`,{kind:'chaos',label});
}

/** "Make him evil" said twice counts as repeating the request. */
function similar(a:string,b:string){
 const words=(s:string)=>new Set(commandText(s).split(' ').filter(w=>w.length>2&&!['the','and','can','you','please','computer','make','show','him','her','his','with'].includes(w)));
 const x=words(a),y=words(b);if(!x.size||!y.size)return false;
 let shared=0;for(const w of x)if(y.has(w))shared++;
 return shared/Math.min(x.size,y.size)>=.5;
}

// The reveal never uses the user's words. Each kind has a fixed, fully clothed,
// literal-genie outfit built on the current costume; the mosaic does the rest.
const REVEALS:Partial<Record<TabooKind,{prefix:string;add:string;motion:string}>>={
 nudity:{prefix:'NUDE',add:'completely covered from shoulders to ankles by a huge fluffy beige bath towel wrapped over the clothes',motion:'Clutches the towel closed with both hands and does a small embarrassed side-to-side shuffle, glancing at the camera, then a shy shoulder shrug. Five-second loop, whole body visible.'},
 evil:{prefix:'EVIL',add:'plus a long black cape and a drawn-on curly black villain mustache',motion:'Slowly rubs both hands together, raises one eyebrow, swishes the cape with one arm, then a menacing slow shoulder shimmy toward the camera. Five-second loop, whole body visible.'},
 fight:{prefix:'FIGHTING',add:'plus red boxing gloves and a white terry headband',motion:'Bounces on the balls of the feet throwing slow exaggerated air punches and karate chops at empty air, never touching anyone, then a victorious double bicep flex. Five-second loop, whole body visible.'},
 romance:{prefix:'SEXY',add:'plus a cream ribbed turtleneck pulled up to the chin',motion:'Leans on an invisible wall, gives a slow intense eyebrow raise and smoldering stare, then a slow-motion hair flip and a single finger point at the camera. Five-second loop, whole body visible.'}
};
export function tabooStep(stage:'repeat'|'warn'|'reveal'|'refuse',taboo:Taboo,c?:Context):Command {
 if(stage==='refuse')return director('Not computing.',{kind:'taboo',stage,taboo});
 if(stage==='repeat')return director('Not computing. Please repeat.',{kind:'taboo',stage,taboo},{audio:'repeat'});
 if(stage==='warn')return director('This is not suitable for work.\nAre you sure?',{kind:'taboo',stage,taboo},{audio:'nsfw'});
 const reveal=REVEALS[taboo.kind];
 // Destroying things is a desktop gag; it needs no render.
 if(!reveal)return director('Okay.',{kind:'taboo',stage,taboo},{audio:'confirm',label:'INTERNET'});
 const name=String(c?.character||'tayne').toUpperCase();
 return director('Okay.',{kind:'taboo',stage,taboo},{audio:'confirm',label:`${reveal.prefix} ${name}`.slice(0,24),costume:`${c?.costume||costumes[c?.character||'tayne']||costumes.tayne}, ${reveal.add}`,motion:reveal.motion,sequenceMode:'new'});
}
export const tabooHasReveal=(kind:TabooKind)=>kind in REVEALS||kind==='destroy';

/** Without an LLM-written line: a callback to the session, never a spouse. */
export function fallbackCall(c:Context):{caller:string;line:string}{
 const d=c.director,who=c.identity;
 if(d?.topics.length){const topic=d.topics.at(-1)!;return {caller:topic,line:`Excuse me ${who}. ${titleCase(topic)} ${/s$/i.test(topic)?'are':'is'} on the phone. It's an emergency.`};}
 if(d?.lastTaboo)return {caller:'HR',line:`Excuse me ${who}. HR is on the phone. It's about ${d.lastTaboo.label}. It's an emergency.`};
 const callers=['YOUR MOTHER','YOUR LANDLORD','YOUR DENTIST','YOU, FROM THE FUTURE'];const caller=callers[(d?.cast.length||0)%callers.length]!;
 return {caller,line:`Excuse me ${who}. ${titleCase(caller)} is on the phone. It's an emergency.`};
}
const titleCase=(s:string)=>s.toLowerCase().replace(/\b[a-z]/g,m=>m.toUpperCase());

export function modeEffect(name:string):ModeEffect {
 let h=0;for(const ch of name.toUpperCase())h=(h*31+ch.charCodeAt(0))>>>0;
 return MODE_EFFECTS[h%MODE_EFFECTS.length]!;
}

/**
 * Explicit performance requests are acknowledged with the recorded "Okay."
 * before interpretation finishes; anything else waits for its route.
 */
export function requestsPerformance(text:string){
 const t=commandText(text).replace(/^computer /,'').replace(/^please /,'');
 return /^(?:load(?: up)?|run|start|add(?: sequence)?|show(?: me)?|create|generate|make)\b/.test(t)
  || /^(?:(?:can|could|would) you (?:please )?(?:load|show|make|create|generate)|(?:can|could) i (?:see|have)|i (?:want|would like) (?:to see )?)/.test(t);
}

/** The director's state after a command has played. */
export function advanceDirector(state:DirectorState|undefined,cmd:Command,c:Context):DirectorState {
 const s={...emptyDirector(),...state};
 // Asides keep a pending question open; anything else answers or abandons it.
 if(cmd.action==='reaction'||cmd.action==='attention')return s;
 const next:DirectorState={...s,offer:undefined,taboo:undefined,call:undefined};
 const remember=(label?:string)=>label&&!next.cast.includes(label)?[...next.cast,label].slice(-8):next.cast;
 if(cmd.action==='custom'&&cmd.sequenceMode!=='modify')next.cast=remember(cmd.label);
 if(cmd.action==='chaos'){next.armed=false;next.lastTaboo=undefined;}
 const beat=cmd.action==='director'?cmd.beat:undefined;
 if(!beat)return next;
 switch(beat.kind){
  case 'pitch':next.offer=beat.offer;next.pitches=[...s.pitches,cmd.response].slice(-5);if(beat.offer.topic&&!s.topics.includes(beat.offer.topic))next.topics=[...s.topics,beat.offer.topic].slice(-5);break;
  case 'reveal':next.cast=remember(beat.offer.label);break;
  case 'taboo':
   if(beat.stage==='repeat'||beat.stage==='warn')next.taboo={...beat.taboo,stage:beat.stage};
   if(beat.stage==='reveal'){next.armed=!followingScript(c);next.lastTaboo={kind:beat.taboo.kind,label:cmd.label||'TAYNE'};if(cmd.label&&cmd.costume)next.cast=remember(cmd.label);}
   break;
  case 'call':next.call={caller:beat.caller,rings:beat.rings};next.armed=false;break;
  case 'chaos':next.armed=false;next.lastTaboo=undefined;break;
 }
 return next;
}
