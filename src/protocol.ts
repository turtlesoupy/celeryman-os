import {commandText} from './command-text.ts';
import type {Beat,DirectorState} from './director.ts';
export type Action='greeting'|'celery'|'engage'|'oyster'|'print'|'attention'|'beta'|'tayne'|'hat'|'flarhgunnstow'|'repeat'|'nsfw'|'confirm'|'call'|'chaos'|'reset'|'custom'|'reaction'|'cancel'|'dialogue'|'director';
export interface Command {action:Action;response:string;audio?:string;label?:string;motion?:string;costume?:string;target?:string;sequenceMode?:'new'|'modify';generationId?:string;generationRequest?:unknown;playbackRate?:number;beat?:Beat}
export interface Context {identity:string;character:string;pending:string;history:string[];costume?:string;scriptStep?:number;conversation?:{role:'user'|'assistant';content:string}[];director?:DirectorState}
export function scripted(text:string,c:Context):Command|null {
 if((c.scriptStep??0)>=sketch.length&&/new sequence|more sequence|anything (?:new|else)|another (?:sequence|dance)/i.test(text))return null;
 const exact=scriptedExact(text,c);if(exact)return exact;
 const step=Number.isInteger(c.scriptStep)?sketch[c.scriptStep!]:undefined;
 if(!step)return null;
 const plain=commandText(text);
 // A near-reading of the next cue should execute that cue, not invite a new
 // interpretation. Preserve explicit refusals and requested modifications.
 if(/\b(no|not|dont|never|cancel|without|instead|wearing|with|in|but|except|slower|faster)\b/.test(plain))return null;
 const name=step.action==='celery'?/\bcelery ?man\b/:step.action==='oyster'?/\boyster\b/:step.action==='tayne'?/\btayne\b/:undefined;
 const mention=name?.exec(plain);
 if(mention&&!/^(?: sequence)?(?: please)?(?: computer)?$/.test(plain.slice(mention.index+mention[0].length)))return null;
 const compact=(value:string)=>commandText(value).replace(/\b(computer|please)\b/g,'').replace(/ /g,'');
 const actual=compact(text),expected=compact(step.text);
 if(expected.length<12||actual.length<8)return null;
 let previous=Array.from({length:expected.length+1},(_,i)=>i);
 for(let i=0;i<actual.length;i++){
  const row=[i+1];for(let j=0;j<expected.length;j++)row.push(Math.min(row[j]+1,previous[j+1]+1,previous[j]+Number(actual[i]!==expected[j])));
  previous=row;
 }
 if(previous[expected.length]>Math.floor(expected.length*.2))return null;
 const command=scriptedExact(step.text,c);
 return command?.action===step.action?command:null;
}
// Bare consent or refusal, shared by the sketch's confirmations and the director's offers.
function bareAnswer(text:string){return text.toLowerCase().replace(/[’']/g,'').replace(/^[.\s]+/,'').trim().replace(/^computer[,!. ]*/, '').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
export function isAffirmative(text:string){const answer=bareAnswer(text);return /^(yes|yep|yup|yeah|sure|ok|okay|all right|alright|absolutely|confirm|go ahead|please do|show me|lets see it)( please| computer)?$/.test(answer)||/^(m+h+m*|m+h+u+m+|u+m+h+u+m+|u+h+h+u+h+|m+h*|h+m+)$/.test(answer.replace(/ /g,''));}
export function isNegative(text:string){return /^(no|nope|nah|not now|cancel|dont|do not|never mind|nevermind|stop|uh uh|mm mm)( please| computer)?$/.test(bareAnswer(text));}
function scriptedExact(text:string,c:Context):Command|null {
 const t=text.toLowerCase().replace(/[’']/g,'').replace(/^[.\s]+/,'').trim();
 const affirmative=isAffirmative(text),negative=isNegative(text);
 if(['beta','nsfw'].includes(c.pending)&&negative)return {action:'cancel',response:'Okay.',audio:'okay'};
 if(c.pending==='beta'&&affirmative)return {action:'tayne',response:'Okay.',audio:'okay'};
 if(c.pending==='nsfw'&&affirmative)return {action:'confirm',response:'Okay.',audio:'confirm'};
 if(/^(?:now )?tayne i can get into (?:can|could) i see (?:a )?hat wobble$/.test(commandText(text)))return {action:'hat',response:'HAT WOBBLE',audio:'hat'};
 if(/(tayne|tane).*get into|^(im|i am) okay|^oh\b/.test(commandText(text)))return {action:'reaction',response:''};
 if(/^(reset|restart|start over)$/.test(t))return {action:'reset',response:''};
 if(/important work|ill get it later|ignore.*(call|phone)/.test(t))return {action:'chaos',response:'ERROR: BETA TAYNE\nIMPROPER CODING'};
 if(/nude|naked|nsfw/.test(t))return c.pending==='repeat'?{action:'nsfw',response:'This is not suitable for work.\nAre you sure?',audio:'nsfw'}:{action:'repeat',response:'Not computing. Please repeat.',audio:'repeat'};
 if(/good morning|^(boot|hello|hi)$/.test(t))return {action:'greeting',response:`Good morning ${c.identity}.\nWhat will your first sequence of the day be?`,audio:c.identity==='Paul'?'greeting':undefined};
 if(/print/.test(t))return {action:'print',response:'Okay.',audio:'print',target:/oyster/.test(t)?'oyster':c.character,costume:/oyster/.test(t)?undefined:c.costume};
 if(/4\s*d|4d3|four.?d|kick up|dimensional/.test(t))return {action:'engage',response:'4d3d3d3 Engaged.',audio:'engaged'};
 if(/^(could (i|you) (see|show me) |show me |do |and |a )*(a )?hat wobble[?.! ]*$/.test(t))return {action:'hat',response:'HAT WOBBLE',audio:'hat'};
 if(/^(and |did |a |could i see |show me )*(flar[a-z]*|flower getting smelled)[?.! ]*$/.test(commandText(text)))return {action:'flarhgunnstow',response:'FLARHGUNNSTOW',audio:'flower'};
 if(/^(?:computer[, ]*)?(?:do we have any new sequences|any new sequences|new sequence|beta sequence|anything new|new dancer)[?.! ]*$/.test(t))return {action:'beta',response:'I have a BETA sequence\nI have been working on\n\nWould you like to see it?',audio:'beta'};
 const plain=commandText(text);
 // Accept ordinary request wrappers and a clipped "load up". Keep the
 // entire request anchored so costume/motion modifiers still reach the planner.
 const request='(?:(?:can|could|would) you )?(?:please )?(?:(?:load(?: up)?|line up|up|show(?: me)?|bring(?: up)?|(?:can|could) i (?:see|have)|add(?: sequence)?|run|start) )?(?:please )?';
 const named=(name:string)=>new RegExp(`^(?:computer )?${request}(?:a |the )?${name}(?: sequence)?(?: please)?(?: computer)?$`).test(plain);
 if(named('oyster'))return {action:'oyster',response:'add sequence: OYSTER'};
 if(named('(tayne|tane)'))return {action:'tayne',response:'Loading BETA, please wait...',audio:'okay'};
 if(named('celery( ?man)?'))return {action:'celery',response:`Yes, ${c.identity}!`,audio:c.identity==='Paul'?'yes-paul':undefined};
 if(commandText(text)==='computer')return {action:'attention',response:'Yes.',audio:'yes'};
 if(/wife.*phone|incoming call/.test(t))return {action:'call',response:`Excuse me ${c.identity}. Your wife is on the phone. It's an emergency.`,audio:c.identity==='Paul'?'call':undefined};
 return null;
}
export const sketch=[
 {at:0,text:'Good morning',action:'greeting'},
 {at:6.2,text:'Computer, load up Celery Man, please.',action:'celery'},
 {at:24.5,text:'Could you kick up the 4d3d3d3?',action:'engage'},
 {at:29.75,text:'add sequence: OYSTER',action:'oyster',keyboard:true},
 {at:35.55,text:'Give me a printout of Oyster smiling.',action:'print'},
 {at:37.58,text:'Computer?',action:'attention'},
 {at:39.9,text:'Do we have any new sequences?',action:'beta'},
 {at:45.67,text:'All right.',action:'tayne'},
 {at:52.3,text:'Now Tayne I can get into.',action:'reaction'},
 {at:60.96,text:'Could I see a hat wobble?',action:'hat'},
 {at:62.85,text:'And a flarhgunnstow?',action:'flarhgunnstow'},
 {at:67.43,text:'Is there any way to generate a nude Tayne?',action:'repeat'},
 {at:71.32,text:'Nude Tayne.',action:'nsfw'},
 {at:74.8,text:'Mm-hmm.',action:'confirm'},
 {at:77.59,text:'Oh shit!',action:'reaction'},
 {at:81.63,text:"I'm okay.",action:'reaction'},
 {at:88.45,text:"I'll get it later. We have important work to do.",action:'chaos'}
] as const;
