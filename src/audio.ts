// One output bus makes audible playback and the benchmark recording identical.
let context:AudioContext|undefined;
let capture:MediaStreamAudioDestinationNode|undefined;
const connected=new WeakSet<HTMLMediaElement>();
let recorder:MediaRecorder|undefined;
let chunks:Blob[]=[];
function bus(){
 context??=new AudioContext();
 capture??=context.createMediaStreamDestination();
 void context.resume();
 return {context,capture};
}
export function unlockAudio(){return bus().context.resume();}
export function routeAudio(media:HTMLMediaElement){
 if(connected.has(media))return media;
 const b=bus();const source=b.context.createMediaElementSource(media);
 source.connect(b.context.destination);source.connect(b.capture);connected.add(media);return media;
}
export function startOutputCapture(){
 const b=bus();chunks=[];recorder=new MediaRecorder(b.capture.stream,{mimeType:'audio/webm;codecs=opus'});
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.start(250);
 return b.context.currentTime;
}
export async function stopOutputCapture(){
 if(!recorder||recorder.state!=='recording')throw Error('Output capture is not running');
 const current=recorder;await new Promise<void>(resolve=>{current.onstop=()=>resolve();current.stop();});
 const bytes=new Uint8Array(await new Blob(chunks,{type:current.mimeType}).arrayBuffer());
 let binary='';for(const b of bytes)binary+=String.fromCharCode(b);return btoa(binary);
}
