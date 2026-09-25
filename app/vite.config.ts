import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site from /<repo>/ — build with BASE_PATH=/<repo>/ npm run build
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
  build: { outDir: 'dist', emptyOutDir: true },
});
