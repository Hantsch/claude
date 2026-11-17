import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// `core/scrum` imports the scrum-cockpit mod's parser by relative path (CONCEPT §4). esbuild looks
// up the nearest tsconfig of every file it transforms, and the plugin's own one extends a file the
// Claude Code engine writes when it loads the plugin: absent in a clean checkout, so the lookup
// fails. A raw tsconfig given as a string turns the lookup off; it repeats what tsconfig.node.json
// says about how TypeScript is compiled for the main process and the preload script.
const NODE_TSCONFIG_RAW = JSON.stringify({
  compilerOptions: { target: 'ES2023', useDefineForClassFields: true, verbatimModuleSyntax: true },
});

export default defineConfig({
  // The package is ESM (`"type": "module"`), but Electron's own module only exposes named
  // exports to CommonJS consumers, and `koffi` is loaded with `require` on demand. Both the
  // main process and the preload script are therefore emitted as CommonJS `.cjs` files.
  main: {
    plugins: [externalizeDepsPlugin()],
    esbuild: { tsconfigRaw: NODE_TSCONFIG_RAW },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/main/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    esbuild: { tsconfigRaw: NODE_TSCONFIG_RAW },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: { index: resolve(import.meta.dirname, 'src/main/preload.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          // Main window, tray popover and session detail window are three separate documents (§8).
          index: resolve(import.meta.dirname, 'src/renderer/index.html'),
          popover: resolve(import.meta.dirname, 'src/renderer/popover.html'),
          detail: resolve(import.meta.dirname, 'src/renderer/detail.html'),
        },
      },
    },
  },
});
