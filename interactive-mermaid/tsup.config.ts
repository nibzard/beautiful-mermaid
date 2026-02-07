import { defineConfig } from 'tsup'

export default defineConfig([
  // Main library builds (ESM + CJS)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    splitting: false,
    treeshake: true,
    external: ['beautiful-mermaid'],
    shims: true,
  },
  // Browser bundle (IIFE for <script> tag usage)
  {
    entry: { 'interactive-mermaid.browser': 'src/browser.ts' },
    format: ['iife'],
    globalName: 'InteractiveMermaid',
    platform: 'browser',
    sourcemap: true,
    minify: true,
    splitting: false,
    treeshake: true,
    // Don't bundle beautiful-mermaid - let users load it separately
    external: [],
  },
])
