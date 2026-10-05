import {createHash} from 'node:crypto';

// These moves use identical outfits, framing and backdrops. The motion reference
// changes later; generating another costume photograph adds no useful information.
export function costumeFrameVariant(canonical:string){
 return canonical==='engaged'?'celery':['sway','flarhgunnstow'].includes(canonical)?'tayne':canonical;
}
export function costumeFrameKey(profile:string,costume:string,closeup:boolean,canonical:string,smiling=false){
 return createHash('sha256').update(JSON.stringify({profile,costume,closeup,canonical:costumeFrameVariant(canonical),...(smiling?{smiling:true}:{}),version:5})).digest('hex').slice(0,20);
}
export function costumeFrameInput(ref:string,costume:string,closeup:boolean,canonical:string,smiling=false,resolution:'0.5K'|'1K'='1K'){
 return {image_urls:[ref],prompt:`Create a new coherent whole-person photograph of the adult person in the supplied image. This photo is the ONLY identity reference. Preserve this person's recognizable face, facial proportions, skin tone, hair, age appearance and body build. Preserve the presence OR absence of facial hair and eyeglasses; never add a beard, mustache or glasses that are absent, unless the requested costume specifically requires glasses. Keep the person's appearance when changing clothes; do not change the person to fit a costume. Preserve the actual face even when it differs from a stereotypical wearer of this outfit. Render the entire person naturally together. General costume description: ${costume}. ${smiling?'A smiling headshot for a photo print: an unmistakable warm, awkward closed-mouth smile with raised cheeks, looking slightly off camera. Hold the whole hat and shoulders inside the frame.':''} ${closeup?'TIGHT head-and-shoulders closeup: hat nearly touches the top edge, face occupies half the image height, crop at upper chest. No waist, legs, feet or full body.':'Entire coherent person from hair to shoe soles, centered and occupying 80% of image height, hands on hips, empty margins above and below.'} ${canonical.endsWith('-face')?'Solid hot pink studio background, edge to edge, no gradient or yellow border.':'Flat light gray seamless studio background.'} Low-budget 1990s lighting. No text, collage or pasted head.`,aspect_ratio:closeup||canonical==='oyster'?'4:3' as const:'9:16' as const,resolution,output_format:'png' as const};
}
