import fs from 'node:fs/promises';
import path from 'node:path';

/** Rehydrate both print-only images and videos after a process restart. */
export async function savedGeneration(media:string,id:string){
 if(!/^[a-f0-9]{20}$/.test(id))return undefined;
 const exists=(name:string)=>fs.access(path.join(media,'generated',name)).then(()=>true,()=>false);
 const image=`/media/generated/${id}-print.png`;
 const [hasPrint,hasVideo]=await Promise.all([exists(id+'-print.png'),exists(id+'.mp4')]);
 if(hasPrint)return {status:'complete',stage:'Ready',url:image,image};
 if(hasVideo)return {status:'complete',stage:'Ready',url:`/media/generated/${id}.mp4`,image:`/media/generated/${id}.png`};
 return undefined;
}
