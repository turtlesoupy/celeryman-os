export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.hostname==='www.celeryman.fun'){url.hostname='celeryman.fun';return Response.redirect(url.toString(),308);}
  const upstream=new URL(url.pathname+url.search,env.ORIGIN_URL);
  const headers=new Headers(request.headers);
  headers.set('X-Cinco-Origin-Token',env.ORIGIN_TOKEN);
  headers.set('X-Cinco-Client-IP',request.headers.get('CF-Connecting-IP')||'unknown');
  headers.delete('Host');
  const response=await fetch(new Request(upstream, {method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'}));
  const result=new Response(response.body,response);
  // Streaming voice and generated media must never be buffered/cached at the edge.
  result.headers.set('Cache-Control','no-store');
  result.headers.set('Strict-Transport-Security','max-age=31536000');
  return result;
 }
};
