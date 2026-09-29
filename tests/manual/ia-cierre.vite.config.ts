import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const stub=fileURLToPath(new URL('./ia-cierre-stubs.ts',import.meta.url));
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['tests/manual/ia-cierre.html']},resolve:{alias:[{find:/^(?:\.\.\/)+(?:context\/AppContext|hooks\/useAsistenteIAChat)$/,replacement:stub}]},server:{host:'127.0.0.1',port:5236,strictPort:true}});
