import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  // GitHub Pages project site path
  // Production: https://deadronos.github.io/packet-foundry/
  base: command === 'build' ? '/packet-foundry/' : '/',
}));