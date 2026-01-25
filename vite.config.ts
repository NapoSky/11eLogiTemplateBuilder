import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [tailwindcss()],
  // Pour GitHub Pages: utilise le nom du repo comme base path
  // En local (dev), utilise './'
  base: process.env.GITHUB_ACTIONS ? '/11eTemplateBuilder/' : './',
  server: {
    host: true, // Expose sur 0.0.0.0 pour WSL2
    port: 5173,
  },
  resolve: {
    alias: {
      '@domain': resolve(__dirname, 'src/domain'),
      '@application': resolve(__dirname, 'src/application'),
      '@infrastructure': resolve(__dirname, 'src/infrastructure'),
      '@presentation': resolve(__dirname, 'src/presentation'),
      '@shared': resolve(__dirname, 'src/shared'),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
