import {defineConfig} from 'vite';
import {voiceLabPlugin} from './server/voice-lab.ts';
import {apiPlugin} from './server/api.ts';
export default defineConfig({plugins:[voiceLabPlugin(),apiPlugin()],server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/public/voice-lab/**','**/public/media/**','**/benchmarks/**','**/analysis/**','**/cache/**','**/reference/**']}},preview:{host:'127.0.0.1'}});
