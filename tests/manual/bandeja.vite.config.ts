import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
const fixture=resolve('tests/manual/bandeja-fixture.ts');
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['tests/manual/bandeja.html']},resolve:{alias:[{find:/.*\/context\/AppContext$/,replacement:fixture},{find:/.*\/hooks\/(usePreferenciasChat|useNombresClientesInbox|useConteosBandeja)$/,replacement:fixture},{find:/.*\/services\/(equipoApi|whatsappInbox.service)$/,replacement:fixture}]},server:{host:'127.0.0.1',port:5193}});
