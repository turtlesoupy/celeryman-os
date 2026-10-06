// A provider URL is not a browser frame. Keep the chrome and content together
// until this particular video element can display its first decoded frame.
export function revealVideoWindow(video:HTMLVideoElement,win:HTMLElement,onReady:()=>void){
 win.style.visibility='hidden';
 let settled=false,frame:number|undefined;
 const cleanup=()=>{
  video.removeEventListener('loadeddata',loaded);
  video.removeEventListener('pause',loaded);
  if(frame!==undefined)video.cancelVideoFrameCallback(frame);
 };
 const reveal=()=>{
  if(settled||!win.isConnected)return;
  settled=true;cleanup();win.style.visibility='';onReady();
 };
 const loaded=()=>{
  if(video.readyState<2)return;
  // Paused/deferred clips still have a decoded image, but no playing frame callback.
  if(video.paused||!video.requestVideoFrameCallback)reveal();
 };
 video.addEventListener('loadeddata',loaded);
 video.addEventListener('pause',loaded);
 if(video.requestVideoFrameCallback)frame=video.requestVideoFrameCallback(reveal);
 loaded();
 return ()=>{settled=true;cleanup();};
}
