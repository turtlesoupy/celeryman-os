export default {
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.hostname==='www.celeryman.fun'){url.hostname='celeryman.fun';return Response.redirect(url.toString(),308);}
  const asset=/^\/(assets|fonts)\//.test(url.pathname);
  const shell=url.pathname==='/'||url.pathname==='/index.html';
  const cacheable=request.method==='GET'&&(asset||shell)&&!request.headers.has('Cookie')&&!request.headers.has('Authorization')&&!request.headers.has('Range')&&(!request.headers.has('Origin')||request.headers.get('Origin')===url.origin);
  const cache=cacheable?caches.default:null;
  const key=new Request(url.toString());
  if(cache){const hit=await cache.match(key);if(hit){const result=new Response(hit.body,hit);result.headers.set('X-Cinco-Cache','HIT');
   // The zone's browser-cache TTL rewrites max-age on stored responses; the shell must revalidate.
   if(shell)result.headers.set('Cache-Control','public, max-age=0, s-maxage=30, must-revalidate');
   return result;}}
  const upstream=new URL(url.pathname+url.search,env.ORIGIN_URL);
  const headers=new Headers(request.headers);
  headers.set('X-Cinco-Origin-Token',env.ORIGIN_TOKEN);
  headers.set('X-Cinco-Client-IP',request.headers.get('CF-Connecting-IP')||'unknown');
  headers.delete('Host');
  const response=await fetch(new Request(upstream, {method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
  const result=new Response(response.body,response);
  // Only public static origin responses may enter the shared edge cache.
  // Never cache personalized responses, errors, streams or uploaded media.
  const publicAsset=asset&&response.status===200&&/\bpublic\b/.test(response.headers.get('Cache-Control')||'')&&!response.headers.has('Set-Cookie')&&!/text\/html/i.test(response.headers.get('Content-Type')||'');
  const publicShell=shell&&response.status===200&&/\bpublic\b/.test(response.headers.get('Cache-Control')||'')&&!response.headers.has('Set-Cookie')&&/text\/html/i.test(response.headers.get('Content-Type')||'');
  const publicResponse=publicAsset||publicShell;
  if(publicShell)result.headers.set('Cache-Control','public, max-age=0, s-maxage=30, must-revalidate');
  if(!publicResponse||(!cacheable&&shell))result.headers.set('Cache-Control','no-store');
  result.headers.set('Strict-Transport-Security','max-age=31536000');
  result.headers.set('X-Cinco-Cache',cache&&publicResponse?'MISS':'BYPASS');
  if(cache&&publicResponse)ctx.waitUntil(cache.put(key,result.clone()));
  return result;
 }
};
