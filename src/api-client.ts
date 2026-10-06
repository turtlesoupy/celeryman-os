import {withSession} from './session';
// Routes that spend provider credit carry the Turnstile-backed session.
export const gatedRoutes=new Set(['command','generate','profile','transcribe','transcribe/session','voice/stream','voice']);
/** Only read-only job polling is retried; never duplicate a paid generation. */
export async function requestJson(url:string,body?:unknown,fetcher:typeof fetch=fetch){
 const polling=url.startsWith('job/')&&body===undefined;
 for(let attempt=0;;attempt++){
  try{
   const send=(headers:Record<string,string>)=>fetcher('/api/'+url,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(polling?10000:45000)});
   const response=gatedRoutes.has(url)?await withSession(send):await send({});
   const text=await response.text();let data:any;
   try{data=JSON.parse(text);}catch{
    if(response.ok)throw Error('The server returned an unreadable response. Please retry the command.');
   }
   if(!response.ok){
    if(polling&&attempt<2&&[502,503,504].includes(response.status))continue;
    throw Error(data?.error||`Server request failed (HTTP ${response.status}). Please retry the command.`);
   }
   return data;
  }catch(error){
   const name=(error as Error).name;
   if(polling&&attempt<2&&(name==='TimeoutError'||name==='TypeError'))continue;
   if(name==='TimeoutError')throw Error(polling?'Lost contact with the generation server. Your dance may still be rendering; repeat the command to reconnect.':'Computer request timed out. Please retry the command.');
   throw error;
  }
 }
}
