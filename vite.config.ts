import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base: './' -> Electron içindeki yerel sunucuda göreli yollar sorunsuz çalışsın
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', chunkSizeWarningLimit: 4000 },
});
