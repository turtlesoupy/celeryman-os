import 'dotenv/config';import fs from 'node:fs';import OpenAI from 'openai';
const client=new OpenAI();
const files=['public/media/original/voice-reference.wav',...process.argv.slice(2)];
const content=[{type:'text',text:'Compare these synthetic speech recordings acoustically, for a software audio quality benchmark. Describe pitch, rate, robotic texture, prosody and timbre. Report similarity of sample two versus sample one from 0-100 with supporting observations. Transcribe each. No speaker identification is requested.'}];
for(const file of files)content.push({type:'text',text:file},{type:'input_audio',input_audio:{data:fs.readFileSync(file).toString('base64'),format:'wav'}});
const r=await client.chat.completions.create({model:'gpt-audio',modalities:['text'],messages:[{role:'user',content}]});console.log(r.choices[0].message.content);
