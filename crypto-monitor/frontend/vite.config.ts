import { defineConfig } from 'vite';
export default defineConfig({
  server: { proxy: Object.fromEntries(['/agent', '/market', '/markets', '/watchlist', '/alerts', '/portfolio', '/session', '/realtime', '/health'].map(path => [path, { target: 'http://127.0.0.1:3000', changeOrigin: false }])) },
});
