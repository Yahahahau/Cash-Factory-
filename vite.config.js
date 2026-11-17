import { defineConfig } from 'vite';

// Unique id for every build. On GitHub Actions this is the commit SHA, so every push
// produces a new version that running iframes can detect through version.json.
const BUILD_ID = (process.env.GITHUB_SHA || '').slice(0, 10) || 'dev-' + Date.now().toString(36);
const BUILT_AT = new Date().toISOString();

function versionFile() {
  return {
    name: 'pcf-version-file',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ version: BUILD_ID, builtAt: BUILT_AT }),
      });
    },
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ version: BUILD_ID, builtAt: BUILT_AT }));
      });
    },
  };
}

export default defineConfig({
  base: './', // relative paths: works on GitHub Pages sub-paths, Netlify, and inside any iframe host
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID), __BUILT_AT__: JSON.stringify(BUILT_AT) },
  plugins: [versionFile()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2500,
    assetsInlineLimit: 8192,
    rollupOptions: { input: { main: 'index.html', authCallback: 'auth-callback.html' } },
  },
  server: { host: true },
});
