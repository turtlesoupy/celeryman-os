import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

// Live previews stream the provider's output before our copy is persisted. The
// preview URL carries that provider URL encrypted (AES-GCM), so any instance can
// serve it while the browser never sees, and callers cannot forge, the target.
// Every instance shares ORIGIN_TOKEN in production; local development is a
// single process, so a random key is sufficient there.
const secret=process.env.MEDIA_TOKEN_SECRET||process.env.ORIGIN_TOKEN||randomBytes(32).toString('hex');
const key=createHash('sha256').update('celeryman-live-preview-v1:'+secret).digest();
// Only provider media hosts may be proxied, even with a valid token.
export const isProviderMediaUrl=(url:string)=>{try{const u=new URL(url);return u.protocol==='https:'&&/(^|\.)fal\.media$/.test(u.hostname);}catch{return false;}};

export function sealMediaUrl(url:string){
 const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
 const sealed=Buffer.concat([cipher.update(url,'utf8'),cipher.final()]);
 return Buffer.concat([iv,cipher.getAuthTag(),sealed]).toString('base64url');
}
export function openMediaUrl(token:string){
 try{
  const bytes=Buffer.from(token,'base64url');if(bytes.length<29)return undefined;
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));
  const url=Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
  return isProviderMediaUrl(url)?url:undefined;
 }catch{return undefined;}
}
