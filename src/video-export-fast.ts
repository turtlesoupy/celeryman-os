import {Input,ALL_FORMATS,BlobSource,CanvasSink,Output,Mp4OutputFormat,BufferTarget,CanvasSource,AudioBufferSource,canEncodeVideo,canEncodeAudio} from 'mediabunny';
import {preloadAudio,loopBuffer} from './audio';

type Composition={canvas:HTMLCanvasElement;draw(source:CanvasImageSource,width:number,height:number):void};
// Decode and encode explicit timestamps. Neither video nor audio waits for playback.
export async function encodeVideoWindow(frame:Composition,url:string,musicUrl:string,rate:number,signal:AbortSignal,progress:(message:string)=>void):Promise<Blob|null>{
 const {width,height}=frame.canvas;
 if(!await canEncodeVideo('avc',{width,height,bitrate:6_000_000}))return null;
 signal.throwIfAborted();
 // Audio is shared with playback, so cancel our wait without cancelling that shared load.
 let cancelLoad=()=>{};
 const cancelled=new Promise<never>((_,reject)=>{cancelLoad=()=>reject(signal.reason);signal.addEventListener('abort',cancelLoad,{once:true});});
 const [videoBlob,decodedAudio]=await Promise.race([Promise.all([
  fetch(url,{signal}).then(r=>{if(!r.ok)throw Error(`Video unavailable: ${r.status}`);return r.blob();}),preloadAudio(musicUrl),
 ]),cancelled]).finally(()=>signal.removeEventListener('abort',cancelLoad));
 signal.throwIfAborted();
 const input=new Input({source:new BlobSource(videoBlob),formats:ALL_FORMATS});
 let output:Output|undefined;
 const abort=()=>{input.dispose();void output?.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
 try{
  const track=await input.getPrimaryVideoTrack();
  if(!track||!await track.canDecode())return null;
  const audio=loopBuffer(decodedAudio,!musicUrl.includes('/original/'));
  if(!await canEncodeAudio('aac',{numberOfChannels:audio.numberOfChannels,sampleRate:audio.sampleRate,bitrate:192_000}))return null;
  const first=await track.getFirstTimestamp(),end=await track.computeDuration(),duration=(end-first)/rate;
  if(!Number.isFinite(duration)||duration<=0||duration>180)throw Error('Video duration is unavailable or too long to export.');
  signal.throwIfAborted();
  const target=new BufferTarget();output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
  const videoSource=new CanvasSource(frame.canvas,{codec:'avc',bitrate:6_000_000,latencyMode:'realtime'});
  const audioSource=new AudioBufferSource({codec:'aac',bitrate:192_000});
  output.addVideoTrack(videoSource,{frameRate:30});output.addAudioTrack(audioSource);await output.start();
  // Use the same trimmed/crossfaded loop and level as MusicLoop, at normal pitch.
  const soundtrack=new AudioBuffer({numberOfChannels:audio.numberOfChannels,sampleRate:audio.sampleRate,length:Math.ceil(duration*audio.sampleRate)});
  for(let c=0;c<audio.numberOfChannels;c++){
   const source=audio.getChannelData(c),dest=soundtrack.getChannelData(c);
   for(let i=0;i<dest.length;i++)dest[i]=source[i%source.length]*.6;
  }
  await audioSource.add(soundtrack);audioSource.close();signal.throwIfAborted();
  const count=Math.ceil(duration*30),timestamps=Array.from({length:count},(_,i)=>first+i/30*rate);
  const sink=new CanvasSink(track,{poolSize:2});let index=0;
  for await(const sample of sink.canvasesAtTimestamps(timestamps)){
   signal.throwIfAborted();if(!sample)throw Error('A video frame could not be decoded.');
   frame.draw(sample.canvas,sample.canvas.width,sample.canvas.height);
   await videoSource.add(index/30,Math.min(1/30,duration-index/30));index++;
   progress(`${Math.floor(index/count*95)}%`);
   // Allow clicks, painting and cancellation while processing faster than real time.
   if(index%15===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  videoSource.close();progress('Finishing');await output.finalize();signal.throwIfAborted();
  return new Blob([target.buffer!],{type:'video/mp4'});
 }finally{
  signal.removeEventListener('abort',abort);input.dispose();if(output&&output.state!=='finalized')await output.cancel();
 }
}
