// The game library (/library): a SEPARATE build from the game (vite.config.ts), run after it by `npm run build`.
// Its own small client bundle (src/library/client.ts + library.css) goes to dist/library/assets; every page is
// PRERENDERED here at build time from the game's own config (src/library/pages.ts), so each route is a real file
// (dist/library/<slug>/index.html) and no SPA rewrite is needed. The game's dist/index.html and its bundle are
// untouched (emptyOutDir false; the game build runs first and empties dist).
import { defineConfig, type Plugin } from 'vite';
import { PAGES } from './src/library/pages';
import { buildIndex } from './src/library/pages';
import { renderBody, pageTitle } from './src/library/render';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const sha = (env.VERCEL_GIT_COMMIT_SHA ?? env.BUILD_SHA ?? 'local').slice(0, 7);

function prerender(): Plugin {
  return {
    name: 'library-prerender',
    enforce: 'post',
    generateBundle: { order: 'post', handler(_o, bundle) {
      const shell = bundle['library/index.html'];
      if (!shell || shell.type !== 'asset') throw new Error('library shell missing');
      const src = String(shell.source).replace('__LIB_SHA__', sha);
      for (const p of PAGES) {
        const html = src.replace('<!--LIB_BODY-->', renderBody(p)).replace(/<title>[^<]*<\/title>/, `<title>${pageTitle(p)}</title>`)
          .replace(/(<meta name="description" content=")[^"]*"/, `$1${p.summary.replace(/"/g, '&quot;')}"`);
        if (p.slug === '') shell.source = html;
        else this.emitFile({ type: 'asset', fileName: `library/${p.slug}/index.html`, source: html });
      }
      this.emitFile({ type: 'asset', fileName: 'library/search-index.json', source: JSON.stringify(buildIndex()) });
    } },
  };
}

export default defineConfig({
  publicDir: 'library/public',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    assetsDir: 'library/assets',
    rollupOptions: { input: 'library/index.html' },
    modulePreload: false,
  },
  plugins: [prerender()],
});
