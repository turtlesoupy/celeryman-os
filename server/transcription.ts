import OpenAI, {toFile} from 'openai';

export const transcriptionVocabulary = 'Vocabulary: Celery Man, Cinco, Tayne, Oyster, 4d3d3d3 (four dee three dee three dee three), hat wobble, flarhgunnstow.';

export async function transcriptionSession(client:OpenAI){
 if(process.env.STREAMING_TRANSCRIPTION==='false')throw Error('Streaming transcription is disabled');
 // The client receives only a short-lived, transcription-only credential.
 const secret=await client.realtime.clientSecrets.create({expires_after:{anchor:'created_at',seconds:60},session:{type:'transcription',audio:{input:{format:{type:'audio/pcm',rate:24000},transcription:{model:'gpt-live-transcribe',languages:['en'],keywords:['Celery Man','Cinco','Tayne','Oyster','4d3d3d3','hat wobble','flarhgunnstow'],delay:'low'},turn_detection:null}}}});
 return {value:secret.value,expiresAt:secret.expires_at};
}
// Selected using real sketch recordings. Keep an env override for comparison
// and rollback; the client cannot select arbitrary paid models.
export const transcriptionModel = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
export async function transcribeAudio(client:OpenAI, bytes:Buffer, mime:string){
 const started=performance.now();
 const newer=transcriptionModel==='gpt-transcribe';
 const args:any={file:await toFile(bytes,`input.${mime.includes('wav')?'wav':mime.includes('mp4')?'mp4':'webm'}`,{type:mime}),model:transcriptionModel,prompt:transcriptionVocabulary,
  ...(newer?{languages:['en']}:{language:'en',response_format:'json',include:['logprobs']})};
 const transcript=await client.audio.transcriptions.create(args);
 return {text:transcript.text,model:transcriptionModel,transcriptionMs:Math.round(performance.now()-started),...('logprobs' in transcript?{logprobs:transcript.logprobs}:{})};
}
