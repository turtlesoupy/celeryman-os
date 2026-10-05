import paulPhoto from '../reference/paul-rudd.png';
import thomasPhoto from '../reference/thomas-dimson.jpg';

// A small indexed bitmap, like a custom Windows icon: keep enough warm shades
// to recognize faces, alongside the gray, navy and teal desktop colors.
const palette=[
 [0,0,0],[40,40,48],[80,80,88],[128,128,128],[192,192,192],[255,255,255],
 [0,0,128],[0,0,255],[0,128,128],[0,192,192],[128,0,0],[192,64,64],
 [112,64,40],[176,120,88],[224,168,136],[255,224,192],
];
const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
const presets=new Map<string,Promise<string>>();
let portraitClipId=0;

export function bitmapPortrait(source:CanvasImageSource,width:number,height:number,crop?:number[]){
 const canvas=document.createElement('canvas');canvas.width=24;canvas.height=32;
 const ctx=canvas.getContext('2d')!;
 const cropWidth=Math.min(width,height*.75),cropHeight=cropWidth/.75;
 const [x,y,w,h]=crop?crop.map((v,i)=>v*(i%2===0?width:height)):[(width-cropWidth)/2,(height-cropHeight)/2,cropWidth,cropHeight];
 ctx.fillStyle='#fff';ctx.fillRect(0,0,24,32);
 ctx.imageSmoothingQuality='high';ctx.drawImage(source,x,y,w,h,0,0,24,32);
 const frame=ctx.getImageData(0,0,24,32),original=new Uint8ClampedArray(frame.data);
 for(let py=0;py<32;py++)for(let px=0;px<24;px++){
  const offset=(py*24+px)*4;
  // Sharpen after downsampling, then add contrast and ordered dithering before
  // quantizing. This runs once per photo, with no animation or GPU dependency.
  const rgb=[0,1,2].map(channel=>{
   let neighbors=0;
   for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]])neighbors+=original[(Math.max(0,Math.min(31,py+dy))*24+Math.max(0,Math.min(23,px+dx)))*4+channel];
   const sharp=original[offset+channel]*1.5-neighbors*.125;
   return Math.max(0,Math.min(255,(sharp-128)*1.12+134+(bayer[(py%4)*4+px%4]-7.5)*2.2));
  });
  let closest=palette[0],distance=Infinity;
  for(const color of palette){
   const d=(rgb[0]-color[0])**2*.3+(rgb[1]-color[1])**2*.59+(rgb[2]-color[2])**2*.11;
   if(d<distance){distance=d;closest=color;}
  }
  frame.data.set([...closest,255],offset);
 }
 ctx.putImageData(frame,0,0);return canvas.toDataURL('image/png');
}

export async function fillPortraitIcon(button:HTMLElement,id:string,thumbnail?:string){
 try{
  let bitmap=thumbnail;
  if(!bitmap&&(id==='paul'||id==='thomas')){
   let pending=presets.get(id);
   if(!pending){
    pending=(async()=>{
     const photo=new Image();photo.src=id==='paul'?paulPhoto:thomasPhoto;await photo.decode();
     return bitmapPortrait(photo,photo.naturalWidth,photo.naturalHeight,id==='thomas'?[.12,.10,.60,.80]:[0,0,1,1]);
    })();
    presets.set(id,pending);
    void pending.catch(()=>presets.delete(id));
   }
   bitmap=await pending;
  }
  if(!bitmap||!/^data:image\/png;base64,/.test(bitmap))return;
  const ns='http://www.w3.org/2000/svg',clipId=`identity-photo-${++portraitClipId}`;
  const clip=document.createElementNS(ns,'clipPath'),outline=document.createElementNS(ns,'path');
  clip.id=clipId;outline.setAttribute('d','M7 2h18l8 8v26H7z');clip.append(outline);
  button.querySelector('svg')?.prepend(clip);
  const portrait=document.createElementNS(ns,'image');
  for(const [key,value] of Object.entries({x:'7',y:'2',width:'26',height:'34',href:bitmap,preserveAspectRatio:'xMidYMid slice','clip-path':`url(#${clipId})`,'image-rendering':'pixelated'}))portrait.setAttribute(key,value);
  button.querySelector('svg g')?.replaceWith(portrait);
 }catch{/* Keep the drawn portrait if a source photo cannot load. */}
}
