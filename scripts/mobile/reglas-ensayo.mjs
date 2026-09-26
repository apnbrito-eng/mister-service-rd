import { readFileSync, writeFileSync } from 'node:fs';
// Copias exclusivas del ensayo: no publica formularios anónimos ni altera reglas productivas.
const header = '// GENERADO por scripts/mobile/reglas-ensayo.mjs. Solo mister-service-ensayo-260921.\n';
writeFileSync('config/firestore.mobile-ensayo.rules', header + readFileSync('firestore.rules', 'utf8').replaceAll('allow create: if true;', 'allow create: if request.auth != null;'));
writeFileSync('config/storage.mobile-ensayo.rules', header + readFileSync('storage.rules', 'utf8').replaceAll('allow write: if request.resource.', 'allow write: if request.auth != null && request.resource.').replaceAll('allow write: if (request.resource.', 'allow write: if request.auth != null && (request.resource.'));
