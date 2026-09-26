import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
const script = resolve('scripts/mobile/prepare-ios-spm.mjs');
describe('Identidad de App Check en SwiftPM', () => {
  it('separa Google y Capacitor de forma reproducible sin modificar el paquete instalado', () => {
    const root = mkdtempSync(join(tmpdir(), 'mister-spm-test-'));
    try {
      const spm = join(root, 'ios/App/CapApp-SPM'), plugin = join(root, 'node_modules/@capacitor-firebase/app-check');
      mkdirSync(spm, { recursive: true }); mkdirSync(join(plugin, 'ios/Plugin'), { recursive: true });
      writeFileSync(join(spm, 'Package.swift'), '.package(name: "CapacitorFirebaseAppCheck", path: "../../../node_modules/@capacitor-firebase/app-check")');
      writeFileSync(join(plugin, 'Package.swift'), 'manifest original'); writeFileSync(join(plugin, 'LICENSE'), 'license'); writeFileSync(join(plugin, 'ios/Plugin/Plugin.swift'), 'source');
      expect(spawnSync(process.execPath, [script], { cwd: root }).status).toBe(0);
      const obsolete = join(spm, '.generated/CapacitorFirebaseAppCheck/ios/Plugin/Plugin 2.swift');
      writeFileSync(obsolete, 'duplicate source');
      expect(spawnSync(process.execPath, [script], { cwd: root }).status).toBe(0);
      expect(existsSync(obsolete)).toBe(false);
      expect(readFileSync(join(spm, 'Package.swift'), 'utf8')).toContain('path: ".generated/CapacitorFirebaseAppCheck"');
      expect(readFileSync(join(spm, '.generated/CapacitorFirebaseAppCheck/ios/Plugin/Plugin.swift'), 'utf8')).toBe('source');
      expect(readFileSync(join(plugin, 'Package.swift'), 'utf8')).toBe('manifest original');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('falla explícitamente cuando cambia la estructura esperada de Capacitor', () => {
    const root = mkdtempSync(join(tmpdir(), 'mister-spm-test-'));
    try {
      const spm = join(root, 'ios/App/CapApp-SPM'); mkdirSync(spm, { recursive: true }); writeFileSync(join(spm, 'Package.swift'), 'otra estructura');
      expect(spawnSync(process.execPath, [script], { cwd: root }).status).not.toBe(0);
      expect(readFileSync(join(spm, 'Package.swift'), 'utf8')).toBe('otra estructura');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
