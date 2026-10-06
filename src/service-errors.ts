export type ServiceFailure={title:string;message:string;recovery:string;blocking:boolean;details:string;status?:string};
export const microphoneBlockedStatus='Microphone blocked · allow it in your browser’s site settings';
export function describeServiceError(raw:string):ServiceFailure{
 const portrait=/^Portrait generation failed:/.test(raw),voice=/^Voice unavailable:/.test(raw),music=/^Music could not load/.test(raw);
 let message=raw.replace(/^(Portrait generation failed|Dance generation failed|Voice unavailable):\s*/,'');
 try{const data=JSON.parse(message);const detail=data.detail??data.error??data.message;message=typeof detail==='string'?detail:Array.isArray(detail)?detail.map(v=>v.msg||v.message||'Provider rejected the request').join('; '):message;}catch{}
 let status:string|undefined,title='Command failed',explanation='The computer could not finish this request.',recovery='Retry the command, or try a different request.';
 if(/credits exhausted|no credits|insufficient_quota|exceeded your current quota|insufficient.*balance|balance.*exhausted/i.test(message)){title='AI service out of credits';explanation='The AI service cannot process this request until its account is topped up.';recovery='The site owner needs to refill the AI account. Then retry.';}
 else if(/401|invalid.*api.?key|authentication|unauthorized/i.test(message)){title='AI service unavailable';explanation='The AI service rejected the server’s credentials.';recovery='The site owner needs to check the service credentials.';}
 else if(/429|rate.?limit|too many requests|busy with other sequences/i.test(message)){title='Service busy';explanation='The service is handling too many requests right now.';recovery='Wait a moment, then retry.';}
 else if(/timeout|timed out|taking too long/i.test(message)){title='Request timed out';explanation=/may still be rendering/i.test(message)?'Contact with the server was lost. Your dance may still be rendering.':'This part of the request took too long to finish.';recovery='Retry to reconnect or start another attempt.';}
 else if(/failed to fetch|load failed|network|connection refused|HTTP 50[234]|Lost contact/i.test(message)){title='Connection interrupted';explanation=/^Dance generation failed:/.test(raw)?'The server lost contact with the AI service while generating this dance.':'The browser could not reach the generation service. Your dance may still be rendering.';recovery='Check your connection, then retry.';}
 else if(/complete command/i.test(message)){title='Incomplete command';explanation=message;recovery='Hold Record or Space, wait for Speak now, then repeat the full command.';}
 else if(/microphone blocked/i.test(message)){title='Microphone blocked';explanation='The browser is not letting this site use the microphone.';recovery='Allow the microphone for this site in your browser’s site settings (usually the icon beside the address bar), then try again.';status=microphoneBlockedStatus;}
 else if(/microphone|recording|no speech/i.test(message)){title='Microphone input failed';explanation=message;recovery='Use the gear to check your microphone or replay captured audio, then record again.';}
 else if(/video.*play|playback/i.test(message)){title='Video could not play';explanation='The video could not start. Other playing windows are unaffected.';recovery='Retry the command to reload the video.';}
 else if(/Generation failed|Dance generation failed/.test(raw)){title='Dance generation failed';explanation='The AI service could not generate this dance.';}
 return {title:portrait?'Portrait unavailable':voice?'Computer voice unavailable':music?'Music unavailable':title,message:explanation,recovery:portrait?'The dancer can still play. Retry the command to retry the portrait.':voice?'The visual sequence can continue. Retry to hear the response.':music?'The video can still play. Retry to reload its music.':recovery,blocking:!portrait&&!voice&&!music,details:raw,status};
}
/** Keep all failures; a later warning must never replace a blocking failure. */
export function primaryFailure(failures:ServiceFailure[]){return failures.find(f=>f.blocking)||failures[0];}
