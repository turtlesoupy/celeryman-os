// These fragments contain neither a command nor a complete acknowledgment.
// Keep short valid replies (yes, no, mm-hmm, uh-uh, please do) intact.
export function incompleteTranscript(text:string){
 const words=text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 return !words||/^(?:(?:and|but|so|then) )?please$|^(?:and|but|so|then|um|uh|erm|er)$/.test(words);
}
