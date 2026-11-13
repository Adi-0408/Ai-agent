import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: false,
    host: true
  },
  build: {
    // Security: Never emit source maps in production to prevent leaking comments or source structure
    sourcemap: false,
    minify: 'esbuild'
  }
});
