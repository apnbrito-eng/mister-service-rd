import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['tests/manual/areas.html']},resolve:{alias:[{find:/.*\/context\/AppContext$/,replacement:resolve('tests/manual/cartera-fixture.tsx')}]},server:{host:'127.0.0.1',port:5210}});
