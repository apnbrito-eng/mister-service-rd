import { initializeApp as adminApp } from "firebase-admin/app";
import { getStorage as adminStorage } from "firebase-admin/storage";
import { initializeApp } from "firebase/app";
import {
  getStorage,
  connectStorageEmulator,
  ref,
  getBytes,
  uploadBytes,
} from "firebase/storage";
import assert from "node:assert/strict";
process.env.FIREBASE_STORAGE_EMULATOR_HOST = "127.0.0.1:9198";
const projectId = "demo-mister-crm-storage",
  bucket = `${projectId}.appspot.com`;
const server = adminStorage(
  adminApp({ projectId, storageBucket: bucket }),
).bucket();
await server.file("crm-private/orden1/imagen").save(Buffer.from("test"));
const storage = getStorage(
  initializeApp({ projectId, storageBucket: bucket, apiKey: "demo" }),
);
connectStorageEmulator(storage, "127.0.0.1", 9198, {
  mockUserToken: { sub: "staff" },
});
async function deny(p) {
  let denied = false;
  try {
    await p;
  } catch (e) {
    denied = e.code === "storage/unauthorized";
  }
  assert.equal(denied, true);
}
await deny(getBytes(ref(storage, "crm-private/orden1/imagen")));
await deny(
  uploadBytes(ref(storage, "crm-private/orden1/otra"), new Uint8Array([1])),
);
await uploadBytes(
  ref(storage, "fotos-piezas/orden1/prueba.jpg"),
  new Uint8Array([1]),
  { contentType: "image/jpeg" },
);
console.log(
  "3 comprobaciones Storage: lectura/escritura de evidencia privada denegadas; foto ordinaria permitida.",
);
