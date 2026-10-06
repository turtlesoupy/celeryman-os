// Draws the desktop link icons as 32x32 Windows 3.1-style objects that carry the
// real brand marks: a computer showing the GitHub mark, a speech balloon with
// Discord's Clyde, and a television playing the YouTube button.
// Run: npx tsx scripts/make-desktop-icons.ts
import {chromium} from 'playwright';
import fs from 'node:fs/promises';

const GITHUB='M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12';

// Plain JS so the TypeScript loader cannot inject helpers into the page.
const kit=`
const N=32,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
const K='#000000',W='#ffffff',LG='#c0c0c0',DG='#808080';
const px=(x,y,col)=>{if(x<0||y<0||x>=N||y>=N)return;g.fillStyle=col;g.fillRect(x,y,1,1);};
const rect=(x,y,w,h,col)=>{g.fillStyle=col;g.fillRect(x,y,w,h);};
const line=(x0,y0,x1,y1,col)=>{const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let e=dx+dy;for(;;){px(x0,y0,col);if(x0===x1&&y0===y1)break;const e2=2*e;if(e2>=dy){e+=dy;x0+=sx;}if(e2<=dx){e+=dx;y0+=sy;}}};
// Raised panel: black outline, white top-left edge, gray bottom-right edge.
const box=(x,y,w,h,fill,light=W,dark=DG)=>{rect(x,y,w,h,K);rect(x+1,y+1,w-2,h-2,fill);rect(x+1,y+1,w-2,1,light);rect(x+1,y+1,1,h-2,light);rect(x+1,y+h-2,w-2,1,dark);rect(x+w-2,y+1,1,h-2,dark);};
// Hard-edged coverage mask of any canvas drawing, in a w x h box.
const mask=(fn,w,h)=>{const S=8,k=document.createElement('canvas');k.width=w*S;k.height=h*S;const q=k.getContext('2d');q.scale(S,S);q.fillStyle='#000';fn(q);const d=q.getImageData(0,0,w*S,h*S).data,m=[];for(let y=0;y<h;y++)for(let x=0;x<w;x++){let a=0;for(let j=0;j<S;j++)for(let i=0;i<S;i++)a+=d[((y*S+j)*w*S+x*S+i)*4+3];m.push(a/(S*S*255)>.5);}return {m,w,h,at:(x,y)=>x>=0&&y>=0&&x<w&&y<h&&m[y*w+x]};};
// Stamp a mask with Win 3.1 shading: lit top-left edge, shaded and dithered bottom-right.
const stamp=(mk,ox,oy,fill,light=fill,dark=fill,outline=null)=>{for(let y=0;y<mk.h;y++)for(let x=0;x<mk.w;x++){
 if(!mk.at(x,y)){if(outline&&(mk.at(x-1,y)||mk.at(x+1,y)||mk.at(x,y-1)||mk.at(x,y+1)))px(ox+x,oy+y,outline);continue;}
 const lit=!mk.at(x-1,y)||!mk.at(x,y-1),shade=!mk.at(x+1,y)||!mk.at(x,y+1),shade2=!mk.at(x+2,y)||!mk.at(x,y+2)||!mk.at(x+1,y+1);
 px(ox+x,oy+y,lit&&!shade?light:shade?dark:shade2&&(x+y)%2?dark:fill);}};
`;

const icons:Record<string,string>={
 // Control Panel-style computer with the GitHub mark on its screen.
 github:`
  box(2,1,28,22,LG);
  rect(5,3,22,16,K);rect(6,4,20,14,DG);rect(7,5,18,12,'#008080');
  const mark=q=>{q.translate(7.5,4.5);q.scale(15/24,15/24);q.fill(new Path2D(${JSON.stringify(GITHUB)}));};
  stamp(mask(q=>{q.beginPath();q.arc(15,12.2,7.5,0,Math.PI*2);q.fill();q.globalCompositeOperation='destination-out';mark(q);},32,32),0,0,W,W,LG);
  stamp(mask(q=>{mark(q);q.globalCompositeOperation='source-in';q.fillRect(0,0,32,32);},32,32),0,0,K,DG,K);
  px(25,20,'#00ff00');rect(21,20,3,1,DG);
  rect(12,23,8,2,K);rect(13,23,6,1,DG);
  box(6,25,20,6,LG);rect(9,27,14,1,DG);rect(9,28,14,1,W);
 `,
 // Speech balloon carrying Clyde.
 discord:`
  const balloon=mask(q=>{q.beginPath();q.roundRect(1.5,1.5,28,21,6);q.fill();q.beginPath();q.moveTo(6,21);q.lineTo(4,30.5);q.lineTo(14,21);q.closePath();q.fill();},31,31);
  stamp({...balloon,at:(x,y)=>balloon.at(x-1,y-1)},0,0,DG);
  stamp(balloon,0,0,W,W,LG,K);
  const clyde=q=>{q.scale(22/24,22/24);q.translate(0,0.2);
   q.beginPath();q.roundRect(2,5.6,20,10.6,4.5);q.fill();
   q.beginPath();q.roundRect(0.6,8,22.8,8.4,4);q.fill();
   q.beginPath();q.ellipse(6.6,5.4,3.6,2,-0.2,0,Math.PI*2);q.fill();
   q.beginPath();q.ellipse(17.4,5.4,3.6,2,0.2,0,Math.PI*2);q.fill();
   q.beginPath();q.ellipse(4.3,16,2.8,2.4,0.4,0,Math.PI*2);q.fill();
   q.beginPath();q.ellipse(19.7,16,2.8,2.4,-0.4,0,Math.PI*2);q.fill();
   q.globalCompositeOperation='destination-out';q.beginPath();q.ellipse(12,19.6,6.6,3.6,0,0,Math.PI*2);q.fill();
   q.beginPath();q.ellipse(8.5,11.2,2,2.3,0,0,Math.PI*2);q.fill();q.beginPath();q.ellipse(15.5,11.2,2,2.3,0,0,Math.PI*2);q.fill();};
  stamp(mask(clyde,22,18),4,3,'#5865f2','#8f97f7','#3c45b8');
 `,
 // Wood-cabinet television with antennae playing the YouTube button.
 youtube:`
  line(15,8,9,1,K);line(16,8,22,1,K);px(9,1,DG);px(22,1,DG);px(8,1,K);px(23,1,K);
  rect(12,6,8,3,K);rect(13,7,6,2,DG);rect(14,7,2,1,LG);
  box(1,9,30,20,'#b05a1e','#e09050','#5a2808');
  rect(3,11,20,15,K);rect(4,12,18,13,'#303030');rect(5,13,16,11,'#101010');
  stamp(mask(q=>{q.beginPath();q.roundRect(0.5,0.5,13,9,3);q.fill();},14,10),6,14,'#ff0000','#ff8080','#c00000');
  stamp(mask(q=>{q.beginPath();q.moveTo(5,2.4);q.lineTo(5,7.6);q.lineTo(9.6,5);q.closePath();q.fill();},14,10),6,14,W);
  for(const ky of [13,18]){rect(24,ky,5,4,K);rect(25,ky+1,3,2,LG);px(25,ky+1,W);}
  for(const sy of [23,25])rect(24,sy,5,1,'#5a2808');
  rect(3,29,4,2,K);rect(25,29,4,2,K);
 `,
};

const browser=await chromium.launch();const page=await browser.newPage();
for(const [name,draw] of Object.entries(icons)){
 const png:string=await page.evaluate(`(()=>{${kit}${draw};return c.toDataURL('image/png');})()`);
 await fs.writeFile(`src/assets/link-${name}.png`,Buffer.from(png.split(',')[1],'base64'));
}
await browser.close();
console.log('Wrote src/assets/link-{github,discord,youtube}.png');
