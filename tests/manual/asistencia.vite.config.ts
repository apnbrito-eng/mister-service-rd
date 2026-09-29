import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['tests/manual/asistencia.html']},resolve:{alias:[{find:/.*\/services\/equipoApi$/,replacement:resolve('tests/manual/asistencia-fixture.ts')}]},server:{host:'127.0.0.1',port:5194}});
