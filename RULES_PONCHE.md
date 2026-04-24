# Rules del módulo de Ponche

Jorge: pegá estos bloques en Firebase Console manualmente (el repo no versiona el ruleset vivo).

## Firestore Rules (agregar al ruleset actual)

Agregar este bloque dentro del `match /databases/{database}/documents` y **antes** del wildcard catch-all (`match /{document=**}`).

```
match /ponches/{docId} {
  // Cualquier user autenticado puede crear un ponche, siempre que sea el suyo
  // (el doc debe declarar su propio uid como personalUid).
  allow create: if request.auth != null
    && request.resource.data.personalUid == request.auth.uid;

  // Leer: solo el dueño del ponche, o admin/coordinadora.
  allow read: if request.auth != null && (
    resource.data.personalUid == request.auth.uid
    || get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol in ['administrador', 'coordinadora']
  );

  // Editar / eliminar: solo admin (correcciones de nómina).
  allow update, delete: if request.auth != null
    && get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol == 'administrador';
}
```

Nota: si el ruleset actual tiene helpers `isAuth()`, `esAdmin()`, `esCoord()`, se puede simplificar a:

```
match /ponches/{docId} {
  allow create: if isAuth() && request.resource.data.personalUid == request.auth.uid;
  allow read: if isAuth() && (
    resource.data.personalUid == request.auth.uid || esAdmin() || esCoord()
  );
  allow update, delete: if esAdmin();
}
```

Si `/ponches` cae bajo un wildcard catch-all más restrictivo, acordate de anteponer este bloque (las rules son first-match wins).

## Storage Rules (agregar al ruleset de Storage)

```
match /fotos-ponche/{uid}/{fileName} {
  // Cualquier usuario autenticado puede leer (simplificación aceptada para
  // que admin/coord puedan mostrar las selfies en el panel de reportes).
  allow read: if request.auth != null;

  // Escribir: solo el propio uid, imagen <5MB, tipo image/*.
  allow write: if request.auth != null
    && request.auth.uid == uid
    && request.resource.contentType.matches('image/.*')
    && request.resource.size < 5 * 1024 * 1024;

  // Nadie puede borrar (se mantiene como evidencia de asistencia).
  allow delete: if false;
}
```

## Cómo pegar

1. Firestore: Console → Firestore Database → Rules → pegar el bloque de `match /ponches/{docId}` → Publicar.
2. Storage: Console → Storage → Rules → pegar el bloque de `fotos-ponche/{uid}/{fileName}` → Publicar.

## Notas de seguridad

- El `read` de Storage está abierto a cualquier usuario autenticado (no sólo al dueño) para que el panel admin funcione sin firmado de URLs. Si en el futuro se quiere restringir, mover a un endpoint serverless que valide el rol contra Firestore y devuelva signed URLs.
- El `create` de Firestore exige que `personalUid == auth.uid`, así que ningún usuario puede crear un ponche a nombre de otro.
- `update/delete` queda sólo para admin — la coordinadora puede **ver** pero no corregir.

## Índices compuestos (Firestore Console → Firestore → Indexes → Composite)

Crear estos índices ANTES de usar el módulo en producción, sino las queries fallan con error "The query requires an index":

1. Collection: ponches
   - Field: fechaRD, Order: Ascending
   - Field: timestamp, Order: Ascending
   - (usado por /admin/ponches onSnapshot del día)

2. Collection: ponches
   - Field: personalUid, Order: Ascending
   - Field: fechaRD, Order: Descending
   - (usado por el historial del empleado)

Si una query falla con error de índice en runtime, Firebase imprime un enlace directo en la consola del navegador para crear el índice — también se puede usar ese link.
