/** Server-only rollout switch. Unset keeps the production reference model. */
export function fastVideoModel(){
 const value=process.env.FAST_VIDEO_MODEL||'reference';
 if(value!=='reference'&&value!=='turbo')throw new Error('FAST_VIDEO_MODEL must be reference or turbo');
 return value;
}
export function fastVideoEndpoint(){
 return fastVideoModel()==='turbo'?'minimax/h3-max-turbo/image-to-video':'minimax/h3-max/reference-to-video';
}
export function fastVideoReferenceInput(reference:string){
 return fastVideoModel()==='turbo'?{image_url:reference}:{reference_image_urls:[reference]};
}
