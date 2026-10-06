/** Phones save to the photo library through the share sheet; a download link only reaches Files. */
export function shareableFile(file:File){
 return matchMedia('(pointer: coarse)').matches&&!!navigator.canShare?.({files:[file]});
}
/** Resolves false when the browser wants a fresh tap before it will open the share sheet. */
export async function shareFile(file:File){
 try{await navigator.share({files:[file]});return true;}
 catch(error){if(error instanceof DOMException&&error.name==='AbortError')return true;if(error instanceof DOMException&&error.name==='NotAllowedError')return false;throw error;}
}
export function downloadBlob(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
}
