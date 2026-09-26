import type { CapacitorConfig } from '@capacitor/cli';
const config: CapacitorConfig = {
  appId: 'com.misterservicerd.tecnicos',
  appName: 'Mister Service · Ensayo',
  webDir: 'dist-mobile',
  android: { useLegacyBridge: true, allowMixedContent: false },
  // CSS env(safe-area-inset-*) reserves the notch and home indicator once.
  ios: { contentInset: 'never' },
  plugins: { FirebaseMessaging: { presentationOptions: ['badge', 'sound', 'alert'] } },
};
export default config;
