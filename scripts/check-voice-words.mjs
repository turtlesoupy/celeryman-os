import 'dotenv/config';import fs from 'node:fs';import OpenAI from 'openai';const c=new OpenAI();
for(const file of process.argv.slice(2)){const r=await c.audio.transcriptions.create({model:'gpt-4o-transcribe',file:fs.createReadStream(file)});console.log(JSON.stringify({file,text:r.text}));}
