import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// Plugin to inject version into service worker
function injectSwVersion() {
  return {
    name: 'inject-sw-version',
    writeBundle() {
      const swPath = resolve(__dirname, 'dist/sw.js');
      try {
        let swContent = readFileSync(swPath, 'utf-8');
        swContent = swContent.replace(/'__APP_VERSION__'/g, `'${pkg.version}'`);
        writeFileSync(swPath, swContent);
        console.log(`Injected version ${pkg.version} into service worker`);
      } catch (e) {
        console.warn('Could not inject version into SW:', e.message);
      }
    }
  };
}

export default defineConfig({
  plugins: [react(), injectSwVersion()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
