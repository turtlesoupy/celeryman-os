export type Action='greeting'|'celery'|'engage'|'oyster'|'print'|'attention'|'beta'|'tayne'|'hat'|'flarhgunnstow'|'repeat'|'nsfw'|'confirm'|'call'|'chaos'|'pause'|'resume'|'reset'|'custom'|'reaction';
export interface Command {action:Action;response:string;audio?:string;label?:string;motion?:string;costume?:string;target?:string}
export interface Context {identity:string;character:string;pending:string;history:string[];costume?:string}
export function scripted(text:string,c:Context):Command|null {
 const t=text.toLowerCase().replace(/[’']/g,'').replace(/^[.\s]+/,'').trim();
 if(/(tayne|tane).*get into|^(im|i am) okay|^oh\b/.test(t))return {action:'reaction',response:''};
 if(/^(reset|restart|start over)$/.test(t))return {action:'reset',response:''};
 if(/^(pause|stop|freeze)( music| dancing| everything)?$/.test(t))return {action:'pause',response:'Sequence paused.'};
 if(/^(resume|continue)( dancing)?$/.test(t))return {action:'resume',response:'Sequence resumed.'};
 if(/important work|ill get it later|ignore.*(call|phone)/.test(t))return {action:'chaos',response:'ERROR: BETA TAYNE\nIMPROPER CODING'};
 if(c.pending==='beta'&&/^(yes|all? ?right|ok|okay|sure|show|lets)/.test(t))return {action:'tayne',response:'Okay.',audio:'okay'};
 if(c.pending==='nsfw'&&/^(yes|mm|mh|uh|ok|sure|confirm)/.test(t))return {action:'confirm',response:'Okay.',audio:'confirm'};
 if(/nude|naked|nsfw/.test(t))return c.pending==='repeat'?{action:'nsfw',response:'This is not suitable for work.\nAre you sure?',audio:'nsfw'}:{action:'repeat',response:'Not computing. Please repeat.',audio:'repeat'};
 if(/good morning|^(boot|hello|hi)$/.test(t))return {action:'greeting',response:`Good morning ${c.identity}.\nWhat will your first sequence of the day be?`,audio:c.identity==='Paul'?'greeting':undefined};
 if(/print/.test(t))return {action:'print',response:'Okay.',audio:'print',target:/oyster/.test(t)?'oyster':c.character,costume:/oyster/.test(t)?undefined:c.costume};
 if(/4\s*d|4d3|four.?d|kick up|dimensional/.test(t))return {action:'engage',response:'4d3d3d3 Engaged.',audio:'engaged'};
 if(/^(could (i|you) (see|show me) |show me |do |and |a )*(a )?hat wobble[?.! ]*$/.test(t))return {action:'hat',response:'HAT WOBBLE',audio:'hat'};
 if(/^(and |a |could i see |show me )*(flar[a-z]*|flower getting smelled)[?.! ]*$/.test(t))return {action:'flarhgunnstow',response:'FLARHGUNNSTOW',audio:'flower'};
 if(/new sequence|beta sequence|anything new|new dancer/.test(t))return {action:'beta',response:'I have a BETA sequence\nI have been working on\n\nWould you like to see it?',audio:'beta'};
 const plain=t.replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 const named=(name:string)=>new RegExp(`^(computer )?((load( up)?|show( me)?|add sequence|run|start) )?${name}( please)?$`).test(plain);
 if(named('oyster'))return {action:'oyster',response:'add sequence: OYSTER'};
 if(named('(tayne|tane)'))return {action:'tayne',response:'Loading BETA, please wait...',audio:'okay'};
 if(named('celery( man)?'))return {action:'celery',response:`Yes, ${c.identity}!`,audio:c.identity==='Paul'?'yes-paul':undefined};
 if(/^(computer)[?!. ]*$/.test(t))return {action:'attention',response:'Yes.',audio:'yes'};
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
