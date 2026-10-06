// Explicit experiment for every generation request, including print frames.
// No variant or profile may silently fall back to the anchored pipeline.
export function usesTextOnlyDance(body:{canonical?:boolean;variant?:string;fastPath?:boolean}){
 return body.fastPath===true;
}
// Portraits describe only clothing above the chest: listing trousers, belts or
// shoes makes the video model tilt down mid-clip to show them.
const lowerBody=/\b(trousers|pants|jeans|slacks|shorts|skirt|leggings|tights|belt|buckle|shoes?|boots?|sneakers?|loafers|heels|sandals|socks|kilt)\b/i;
export function upperBodyCostume(costume:string){
 const kept=costume.split(/[,;]/).map(part=>part.trim()).filter(part=>part&&!lowerBody.test(part));
 return kept.length?kept.join(', '):costume;
}
// Mentioning a hat for a bareheaded costume makes the model add one.
const head=(costume:string)=>/\b(hat|cap|beanie|fedora|helmet|crown|hood|headband|turban|beret)\b/i.test(costume)?'head and headwear':'head';
export function smilePortraitPrompt(costume:string){
 return `Image 1 supplies only the identity of the adult performer. Preserve their recognizable face, hair, facial hair and eyewear unless the outfit explicitly replaces it. Ignore the reference clothing, pose and scenery. Dress in ${upperBodyCostume(costume)}. Tight head-and-shoulders studio portrait, full ${head(costume)} visible, shoulders and upper chest in frame. Look at the camera and hold a broad closed-mouth smile from the very first frame through the entire clip. Uniform pale gray empty background. Locked camera. Exactly one person. No props, background figures, text, cuts, speech or music.`;
}
export function textMotionPrompt(costume:string,motion:string,portrait=false){
 if(portrait)return `Generate the SAME recognizable adult person depicted in Image 1, the original identity photograph. Preserve facial proportions, hair, age appearance, and presence or absence of facial hair and eyeglasses, except eyewear or headwear explicitly specified by the costume. Image 1 supplies identity only: never copy its clothing, scenery, pose or camera framing. Dress the person in this outfit: ${upperBodyCostume(costume)}. Reframe as a tight head-and-shoulders portrait, with the entire ${head(costume)} visible with a small margin above, shoulders and upper chest filling the bottom edge. Never show the waist, legs or feet. Solid hot pink studio background, edge to edge. Locked static camera with no zoom. Flat 1990s low-budget desktop footage. Small rhythmic head bobs and glances, subtle awkward smile. Exactly one coherent person, no pasted head, collage, other people, text, cuts or speech. End in the starting pose for a seamless five-second loop.`;
 return `Generate the SAME recognizable adult person depicted in Image 1, the original identity photograph. Preserve facial proportions, hair, age appearance, body build, and presence or absence of facial hair and eyeglasses, except eyewear or headwear explicitly specified by the costume. Any additional still reference depicts this same person already dressed in the requested costume and supplies costume and staging guidance. The original identity photograph supplies identity only: never copy its clothing, scenery, pose or camera framing. Dress the person in this complete outfit: ${costume}. Full body including shoes visible throughout, centered, occupying 80% of frame height, with margins above and below. Flat uniform light gray seamless studio background. Locked static camera, flat 1990s low-budget desktop dance footage. Choreography: ${motion} Exactly one coherent whole person; no pasted head, collage, other people, text, cuts or speech. Start moving immediately, repeat a rhythmic five-second cycle, end in the starting pose without stopping or fading.`;
}
