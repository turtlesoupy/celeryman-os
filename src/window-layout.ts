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
 if(/launch/.test(c)){w=Math.min(460,s.width-16);h=Math.min(550,available);x=(s.width-w)/2;y=s.top+(available-h)/2;}
 else if(/terminal/.test(c)){w=Math.min(360,s.width-24);h=c.includes('large')?Math.min(260,available):Math.min(128,available);x=12;y=s.bottom-h;}
 else if(/phone/.test(c)){w=180;h=Math.min(275,available);x=(s.width-w)/2;y=s.top+(available-h)*.45;}
 else if(/nsfw|error/.test(c)){w=Math.min(460,s.width-24);h=Math.min(164,available);x=(s.width-w)/2;y=s.top+(available-h)*.65;}
 else if(/input-settings|boot|print-preview/.test(c)){w=Math.min(420,s.width-24);h=Math.min(c.includes('input-settings')?270:o.h>250?400:160,available);x=(s.width-w)/2;y=s.top+(available-h)*.4;}
 else if(c.includes('chaos-portrait')){
  w=Math.min(280,s.width*.76);h=Math.min(w*.85+36,available);
  x=8+(s.width-w-16)*Math.max(0,Math.min(1,o.x/660));
  y=s.top+(available-h)*Math.max(0,Math.min(1,(o.y-68)/210));
 }else if(/portrait/.test(c)){
  w=Math.min(o.w,landscape?250:s.width*.72);h=Math.min(w*.85+36,available);
  x=8+(s.width-w-16)*Math.max(0,Math.min(1,o.x/650));
  y=s.top+(available-h)*(landscape?.35:.65)+Math.min(24,o.y/12);
 }else{
  h=Math.min(o.h,Math.max(160,available-(landscape?0:70)));
  w=Math.min(o.w,s.width*.7,Math.max(200,h*.62));
  x=8+(s.width-w-16)*Math.max(0,Math.min(1,o.x/680));
  y=s.top+Math.max(0,Math.min(available-h,o.y*.3));
 }
 return clampFrame({...o,x,y,w,h},s);
}
