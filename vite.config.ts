import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

const gitHash = (() => {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.substring(0, 7)
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return String(Date.now())
  }
})()

function versionJsonPlugin(commit: string) {
  return {
    name: 'generate-version-json',
    buildStart() {
      const payload = {
        commit,
        builtAt: new Date().toISOString(),
      }
      writeFileSync(
        resolve(projectRoot, 'public/version.json'),
        JSON.stringify(payload, null, 2),
      )
    },
  }
}

export default defineConfig({
  plugins: [react(), versionJsonPlugin(gitHash)],
  define: {
    __APP_VERSION__: JSON.stringify(gitHash),
  },
  server: {
    port: 5173,
  },
})
