import assert from 'node:assert/strict';
import {fastVideoModel,fastVideoEndpoint,fastVideoReferenceInput} from '../server/video-model.ts';
import {generationKey} from '../server/choreography.ts';
const old=process.env.FAST_VIDEO_MODEL;
try{
 delete process.env.FAST_VIDEO_MODEL;
 const body={fastPath:true,profile:'test',character:'celery',variant:'base',canonical:true};
 const reference=generationKey(body),legacy=generationKey({...body,fastPath:false});
 assert.equal(fastVideoModel(),'reference');assert.deepEqual(fastVideoReferenceInput('photo'),{reference_image_urls:['photo']});
 // A request's videoModel (the ?turbo=1 flag) picks turbo without the server switch, with its own cache key.
 const turbo={...body,videoModel:'turbo'};
 assert.equal(fastVideoEndpoint(turbo),'minimax/h3-max-turbo/image-to-video');assert.deepEqual(fastVideoReferenceInput('photo',turbo),{image_url:'photo'});
 assert.notEqual(generationKey(turbo),reference);assert.equal(fastVideoModel({videoModel:'nonsense'}),'reference');
 process.env.FAST_VIDEO_MODEL='turbo';assert.equal(fastVideoEndpoint(),'minimax/h3-max-turbo/image-to-video');assert.deepEqual(fastVideoReferenceInput('photo'),{image_url:'photo'});
 assert.notEqual(generationKey(body),reference);assert.equal(generationKey({...body,fastPath:false}),legacy);
 process.env.FAST_VIDEO_MODEL='reference';assert.equal(generationKey(body),reference);
 assert.equal(generationKey(turbo),generationKey({...body,videoModel:'turbo'}));process.env.FAST_VIDEO_MODEL='turbo';assert.equal(generationKey({...body,videoModel:'reference'}),reference);
 process.env.FAST_VIDEO_MODEL='typo';assert.throws(()=>fastVideoModel(),/must be/);
 console.log('Model selection (server switch and per-request flag), input shape, cache isolation and rollback passed.');
}finally{if(old===undefined)delete process.env.FAST_VIDEO_MODEL;else process.env.FAST_VIDEO_MODEL=old;}
