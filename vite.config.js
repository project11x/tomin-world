import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import prerenderProjects from './vite-plugin-prerender.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [prerenderProjects()],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        adminPins: resolve(__dirname, 'admin-pins.html'),
        adminFrames: resolve(__dirname, 'admin-frames.html'),
        dailyFrame: resolve(__dirname, 'daily-frame.html'),
      },
    },
  },
});
