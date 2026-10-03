import './printout.css';
export interface Printout {image:string;character:string;name:string}
/** Decode the actual smiling frame before opening a native dialog: never print a blank image. */
export async function preparePrintout(job:Printout):Promise<()=>void>{
 if(!job.image)throw Error('The smiling portrait is unavailable. Repeat the print command.');
 const image=new Image();image.alt=`${job.name} smiling as ${job.character}`;
 const loaded=new Promise<void>((resolve,reject)=>{
  const timer=window.setTimeout(()=>reject(Error('Print image timed out. Repeat the print command.')),15000);
  image.onload=()=>{clearTimeout(timer);resolve();};
  image.onerror=()=>{clearTimeout(timer);reject(Error('Print image could not load. Repeat the print command.'));};
 });
 image.src=job.image;await loaded;await image.decode();
 const sheet=document.createElement('section');sheet.id='print-sheet';sheet.setAttribute('aria-label',image.alt);sheet.append(image);
 return ()=>{
  document.querySelector('#print-sheet')?.remove();document.body.append(sheet);
  // Use the same document, so a voice command does not depend on popup permission.
  // The browser owns printer choice, PDF export, and cancellation. It does not
  // expose whether the user printed or cancelled, so never report "printed" here.
  window.print();
 };
}
