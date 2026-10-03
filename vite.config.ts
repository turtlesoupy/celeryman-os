import {defineConfig} from 'vite';
import {apiPlugin} from './server/api.ts';
export default defineConfig({plugins:[apiPlugin()],server:{host:'127.0.0.1',port:5173,strictPort:true,watch:{ignored:['**/public/media/**','**/benchmarks/**','**/analysis/**','**/cache/**','**/reference/**']}},preview:{host:'127.0.0.1'}});
