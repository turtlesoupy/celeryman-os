import assert from 'node:assert/strict';
import {MicrophoneDevices,microphoneConstraints,resolveMicrophone} from '../src/microphone-device.ts';
const input=(deviceId:string,label:string,groupId:string)=>({kind:'audioinput',deviceId,label,groupId}) as MediaDeviceInfo;
const laptop=input('laptop','MacBook Pro Microphone','built-in'),headset=input('headset','Bluetooth Headphones','bluetooth');
let devices=[input('default','Default - Bluetooth Headphones','bluetooth'),laptop,headset];
const stream=(device:MediaDeviceInfo)=>{
 const track={label:device.label,readyState:'live',getSettings:()=>({deviceId:device.deviceId,groupId:device.groupId}),stop(){this.readyState='ended';}};
 return {getAudioTracks:()=>[track],getTracks:()=>[track]} as unknown as MediaStream;
};
const storage=new Map<string,string>();const settings={getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>{storage.set(k,v);}};
let calls=0,returned=headset,lastConstraints:MediaStreamConstraints|undefined,lastStream:MediaStream;
const media={addEventListener(){},enumerateDevices:async()=>devices,getUserMedia:async(c:MediaStreamConstraints)=>{calls++;lastConstraints=c;return lastStream=stream(returned);}} as unknown as MediaDevices;
const mic=new MicrophoneDevices(()=>{},()=>false,media,settings);
assert.deepEqual(microphoneConstraints('default').deviceId,{exact:'default'});
assert.equal(resolveMicrophone([headset,laptop],'default')?.deviceId,'headset');
assert.equal(resolveMicrophone(devices,'default')?.deviceId,'headset');
const stale=stream(laptop);const opened=await mic.open(stale);
assert.equal(stale.getAudioTracks()[0].readyState,'ended');
assert.deepEqual((lastConstraints!.audio as MediaTrackConstraints).deviceId,{exact:'headset'});
assert.equal(opened.getAudioTracks()[0].label,headset.label);
assert.equal(await mic.open(opened),opened);assert.equal(calls,1);
// A changed default invalidates a previously opened, still-live input.
devices=[input('default','Default - MacBook Pro Microphone','built-in'),laptop,headset];returned=laptop;
const switched=await mic.open(opened);assert.equal(opened.getAudioTracks()[0].readyState,'ended');assert.equal(switched.getAudioTracks()[0].label,laptop.label);
// A browser returning another device is rejected and its track is stopped.
devices=[input('default','Default - Bluetooth Headphones','bluetooth'),laptop,headset];returned=laptop;
await assert.rejects(()=>mic.open(),/Microphone mismatch.*Bluetooth Headphones.*MacBook Pro Microphone/);
assert.equal(lastStream!.getAudioTracks()[0].readyState,'ended');
storage.set('cinco-microphone','headset');storage.set('cinco-microphone-label',headset.label);devices=[laptop];
const pinned=new MicrophoneDevices(()=>{},()=>false,media,settings);const before=calls;
await assert.rejects(()=>pinned.open(),/disconnected.*Bluetooth Headphones/);assert.equal(calls,before);
// First permission must retain the opened headset, not stop and reopen it.
let permitted=false,firstOpens=0;
const firstStream=stream(headset);
const firstMedia={addEventListener(){},enumerateDevices:async()=>permitted?[input('default','Default - Bluetooth Headphones','bluetooth'),headset]:[input('','','')],getUserMedia:async()=>{firstOpens++;permitted=true;return firstStream;}} as unknown as MediaDevices;
const fresh=new MicrophoneDevices(()=>{},()=>false,firstMedia,{getItem:()=>null,setItem(){}});
assert.equal(await fresh.open(),firstStream);assert.equal(firstOpens,1);
assert.equal(firstStream.getAudioTracks()[0].readyState,'live');
// Safari has no "default" alias and rejects an exact "default" request without prompting.
let safariPermitted=false;const iphone=input('iphone','iPhone Microphone','iphone'),airpods=input('airpods','AirPods','airpods');
const safariStream=stream(airpods);let safariConstraints:MediaTrackConstraints|undefined;
const safariMedia={addEventListener(){},enumerateDevices:async()=>safariPermitted?[iphone,airpods]:[input('','','')],getUserMedia:async(c:MediaStreamConstraints)=>{safariConstraints=c.audio as MediaTrackConstraints;if(safariConstraints.deviceId)throw new DOMException('No default','OverconstrainedError');safariPermitted=true;return safariStream;}} as unknown as MediaDevices;
const safari=new MicrophoneDevices(()=>{},()=>false,safariMedia,{getItem:()=>null,setItem(){}});
assert.equal(await safari.open(),safariStream);assert.equal(safariConstraints!.deviceId,undefined);
assert.equal(await safari.open(safariStream),safariStream);
let safariLabel='';safari.subscribe(label=>{safariLabel=label;});assert.equal(safariLabel,'AirPods');
console.log('Microphone checks passed: default resolution, exact constraints, stale stream replacement, warm reuse, default change, wrong-device rejection, disconnected selection, Safari system default.');
