export function describeServiceError(message:string){
 if(/credits exhausted|no credits|insufficient_quota|exceeded your current quota/i.test(message))return {title:'API credits exhausted',message,recovery:'Top up the API account, then repeat the command. No restart needed.'};
 if(/401|invalid.*api.?key|authentication|unauthorized/i.test(message))return {title:'Service authentication failed',message,recovery:'Check the service API key on the local server, then try again.'};
 if(/429|rate.?limit|too many requests/i.test(message))return {title:'Service rate limit',message,recovery:'Wait a moment, then repeat the command.'};
 if(/timeout|timed out|taking too long/i.test(message))return {title:'Request timed out',message,recovery:'The command did not finish. Repeat it to try again.'};
 if(/failed to fetch|load failed|network|connection refused/i.test(message))return {title:'Connection failed',message,recovery:'Check the network and local server, then repeat the command.'};
 if(/microphone|recording|no speech/i.test(message))return {title:'Microphone input failed',message,recovery:'Use F1 → Replay mic to check captured audio, or type your command.'};
 return {title:'Command failed',message,recovery:'Repeat the command to retry, or try a different command.'};
}
