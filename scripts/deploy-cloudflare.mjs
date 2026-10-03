import 'dotenv/config';
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const account='fb263d2282a87c35a4cbda244c33a74c',zone='8e6a6bfa80de5340530da62bde57430e',worker='celeryman-os';
const headers=process.env.CLOUDFLARE_API_TOKEN?{Authorization:`Bearer ${process.env.CLOUDFLARE_API_TOKEN}`}:{'X-Auth-Key':process.env.CLOUDFLARE_API_KEY,'X-Auth-Email':process.env.CLOUDFLARE_EMAIL};
if(!process.env.ORIGIN_TOKEN)throw Error('ORIGIN_TOKEN missing in local .env');
const origin=execFileSync('gcloud',['run','services','describe','celeryman','--region=us-central1','--project=celeryman-os','--format=value(status.url)'],{encoding:'utf8'}).trim();
async function api(route,method,body){
 const res=await fetch(`https://api.cloudflare.com/client/v4/${route}`,{method,headers:body instanceof FormData?headers:{...headers,'Content-Type':'application/json'},body:body instanceof FormData?body:body?JSON.stringify(body):undefined});
 const data=await res.json();if(!data.success)throw Error(`Cloudflare ${res.status}: ${JSON.stringify(data.errors)}`);return data.result;
}
const form=new FormData();
form.set('metadata',JSON.stringify({main_module:'worker.js',compatibility_date:'2026-10-03',bindings:[{type:'plain_text',name:'ORIGIN_URL',text:origin},{type:'secret_text',name:'ORIGIN_TOKEN',text:process.env.ORIGIN_TOKEN}]}));
form.set('worker.js',new Blob([await fs.readFile('deploy/cloudflare-worker.js')],{type:'application/javascript+module'}),'worker.js');
await api(`accounts/${account}/workers/scripts/${worker}`,'PUT',form);
for(const hostname of ['celeryman.fun','www.celeryman.fun'])await api(`accounts/${account}/workers/domains`,'PUT',{hostname,service:worker,environment:'production',zone_id:zone});
await api(`accounts/${account}/workers/scripts/${worker}/subdomain`,'POST',{enabled:false,previews_enabled:false});
console.log('Cloudflare HTTPS routes deployed: celeryman.fun and www.celeryman.fun');
