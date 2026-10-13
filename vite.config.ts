import { defineConfig } from 'vitest/config';

// The commit this bundle was built from, shown in Settings > About so a served build can be matched to its source.
// Vercel sets VERCEL_GIT_COMMIT_SHA during builds; a local build can pass BUILD_SHA, otherwise "local".
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const sha = (env.VERCEL_GIT_COMMIT_SHA ?? env.BUILD_SHA ?? 'local').slice(0, 7);

export default defineConfig({
  define: { __BUILD_SHA__: JSON.stringify(sha) },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
