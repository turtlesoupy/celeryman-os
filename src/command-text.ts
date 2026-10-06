// A misheard address ("Theater, load up ...") must not hide an otherwise
// explicit command. Only drop one comma-separated word before a request verb;
// retain negation, commentary, and all requested modifiers.
export function commandText(text:string){
 let value=text.toLowerCase().replace(/[’']/g,'').trim();
 value=value.replace(/^([a-z]+),\s*(?=(?:please\s+)?(?:load|run|start|add|show|create|generate|make)\b)/, (match,word:string)=>
  ['no','not','never','dont','stop','cancel'].includes(word)?match:'');
 return value.replace(/[^a-z0-9 ]/g,' ').replace(/\b(?:tane|tayna|tain)\b/g,'tayne').replace(/\b(?:flargenstow|flarginstow|bargainsto)\b/g,'flarhgunnstow').replace(/\s+/g,' ').trim();
}
