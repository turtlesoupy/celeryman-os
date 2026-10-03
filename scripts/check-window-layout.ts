import assert from 'node:assert/strict';
import {mobileFrame,clampFrame,type Frame} from '../src/window-layout.ts';
const windows:Frame[]=[
 {x:250,y:93,w:460,h:397,className:'launch'},
 {x:520,y:12,w:282,h:502},
 {x:125,y:62,w:375,h:332,className:'portrait'},
 {x:60,y:405,w:362,h:101,className:'terminal'},
 {x:204,y:147,w:532,h:283,className:'terminal large'},
 {x:325,y:278,w:525,h:162,className:'nsfw'},
 {x:398,y:126,w:150,h:225,className:'phone'},
 {x:250,y:180,w:460,h:190,className:'input-settings'},
 ...Array.from({length:8},(_,i)=>({x:20+(i*137)%640,y:68+(i*67)%210,w:280,h:245,className:'chaos-portrait'}))
];
for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[768,1024],[390,340]]){
 const space={width,height,top:height<500?84:112,bottom:height-84};
 for(const original of windows){
  const frame=mobileFrame(original,space);
  assert(frame.x>=8&&frame.x+frame.w<=width-8+.01,'Window must stay horizontally reachable');
  assert(frame.y>=space.top&&frame.y+frame.h<=space.bottom+.01,'Window must not cover touch controls');
  assert(frame.w>=150&&frame.h>=80,'Keep a usable unscaled window');
 }
 const dragged=clampFrame({x:-500,y:10000,w:3000,h:3000},space);
 assert.equal(dragged.x,8);assert.equal(dragged.y,space.top);
 assert.equal(dragged.w,width-16);assert.equal(dragged.h,space.bottom-space.top);
}
console.log('Mobile window bounds passed for portrait, landscape, tablet, and keyboard-sized viewports.');
