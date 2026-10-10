type ModelChoice={videoModel?:unknown};
/** Rollout switch for fast dances. A request's videoModel (the client's ?turbo=1)
 * wins over FAST_VIDEO_MODEL; unset keeps the production reference model. */
export function fastVideoModel(body?:ModelChoice){
 if(body?.videoModel==='turbo'||body?.videoModel==='reference')return body.videoModel;
 const value=process.env.FAST_VIDEO_MODEL||'reference';
 if(value!=='reference'&&value!=='turbo')throw new Error('FAST_VIDEO_MODEL must be reference or turbo');
 return value;
}
export function fastVideoEndpoint(body?:ModelChoice){
 return fastVideoModel(body)==='turbo'?'minimax/h3-max-turbo/image-to-video':'minimax/h3-max/reference-to-video';
}
export function fastVideoReferenceInput(reference:string,body?:ModelChoice){
 return fastVideoModel(body)==='turbo'?{image_url:reference}:{reference_image_urls:[reference]};
}
