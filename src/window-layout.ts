export type Frame={x:number;y:number;w:number;h:number;className?:string};
export type Workspace={width:number;height:number;top:number;bottom:number};
export function clampFrame(frame:Frame,space:Workspace):Frame{
 const w=Math.min(frame.w,space.width-16),h=Math.min(frame.h,space.bottom-space.top);
 return {...frame,w,h,x:Math.max(8,Math.min(space.width-w-8,frame.x)),y:Math.max(space.top,Math.min(space.bottom-h,frame.y))};
}
/** Recompose the reference desktop into overlapping, unscaled touch windows. */
export function mobileFrame(o:Frame,s:Workspace):Frame{
 const c=o.className||'',landscape=s.width>s.height,available=s.bottom-s.top;
 let w:number,h:number,x:number,y:number;
 if(/launch/.test(c)){w=Math.min(460,s.width-16);h=Math.min(o.h+50,available);x=(s.width-w)/2;y=s.top+(available-h)/2;}
 else if(/terminal/.test(c)){w=Math.min(360,s.width-24);h=c.includes('large')?Math.min(260,available):Math.min(144,available);x=12;y=s.bottom-h;}
 else if(/phone/.test(c)){w=180;h=Math.min(275,available);x=(s.width-w)/2;y=s.top+(available-h)*.45;}
 else if(/nsfw|error/.test(c)){w=Math.min(460,s.width-24);h=Math.min(164,available);x=(s.width-w)/2;y=s.top+(available-h)*.65;}
 else if(/identity-upload/.test(c)){w=Math.min(420,s.width-24);h=Math.min(Math.max(o.h,500),available);x=(s.width-w)/2;y=s.top+(available-h)/2;}
 else if(/input-settings|boot|print-preview/.test(c)){w=Math.min(420,s.width-24);h=Math.min(c.includes('input-settings')?360:o.h>250?400:160,available);x=(s.width-w)/2;y=s.top+(available-h)*.4;}
 else if(c.includes('chaos-portrait')){
  w=Math.min(280,s.width*.76);h=Math.min(w*.85+36,available);
  x=8+(s.width-w-16)*Math.max(0,Math.min(1,o.x/660));
  y=s.top+(available-h)*Math.max(0,Math.min(1,(o.y-68)/210));
 }else if(/portrait/.test(c)&&landscape){
  w=Math.min(o.w,250);h=Math.min(w*.85+36,available);
  x=8+(s.width-w-16)*Math.max(0,Math.min(1,o.x/650));
  y=s.top+(available-h)*.35+Math.min(24,o.y/12);
 }else{
  // A phone has height to spare: keep the footage's own shape (videos stretch to
  // fill) and grow it to the screen width or the computer, whichever comes first.
  const chrome=29,aspect=o.w/Math.max(1,o.h-chrome);
  h=Math.min(o.h*(landscape?1:1.6),available);w=(h-chrome)*aspect;
  if(w>s.width-16){w=s.width-16;h=w/aspect+chrome;}
  w=Math.max(w,Math.min(200,s.width-16));
  x=8+(s.width-w-16)*Math.max(0,Math.min(1,o.x/(960-o.w||1)));
  // Portraits sit low so the dancer they overlap keeps its head and torso in view.
  y=s.top+(available-h)*(/portrait/.test(c)?1:Math.max(0,Math.min(1,o.y/(540-o.h||1))));
 }
 return clampFrame({...o,x,y,w,h},s);
}
