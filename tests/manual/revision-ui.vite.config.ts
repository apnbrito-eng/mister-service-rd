import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
export default defineConfig({plugins:[react()],resolve:{alias:[{find:'firebase/firestore',replacement:resolve('tests/manual/revision-firestore.ts')},{find:/.*\/context\/AppContext$/,replacement:resolve('tests/manual/cartera-fixture.tsx')}]},server:{host:'127.0.0.1',port:5212}});
