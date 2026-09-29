import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'node:path';
const fixture=resolve('tests/manual/clientes-qa-fixture.ts');
export default defineConfig({plugins:[react()],optimizeDeps:{entries:['tests/manual/clientes-qa.html']},resolve:{alias:[
{find:/^firebase\/firestore$/,replacement:fixture},
{find:/.*\/firebase\/config$/,replacement:fixture},
{find:/.*\/context\/AppContext$/,replacement:fixture},
{find:/.*\/services\/clientes.service$/,replacement:fixture},
{find:/.*\/components\/(clientes\/(EditarClienteModal|MapaClientes|TabReactivacion)|ordenes\/EliminarOrdenButton)$/,replacement:resolve('tests/manual/clientes-qa-stub.tsx')},
]},server:{host:'127.0.0.1',port:5211,strictPort:true}});
