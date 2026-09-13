import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  // three/examples/jsm modules can otherwise pull in a second copy of three.
  resolve: { dedupe: ['three'] },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4096,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Deliberately NOT grouping @dimforge here. The SIMD and non-SIMD
          // Rapier builds are loaded by a conditional dynamic import, and
          // forcing them into one named chunk defeats that — it welds both
          // copies (~6 MB) into a single file every visitor downloads. Left
          // alone, Rollup splits them and only the one this browser can run
          // is fetched.
          if (id.includes('node_modules/three')) return 'three';
        },
      },
    },
  },
  // Rapier ships a large inlined wasm payload; let esbuild leave it alone.
  optimizeDeps: { exclude: ['@dimforge/rapier3d-compat', '@dimforge/rapier3d-simd-compat'] },
});
