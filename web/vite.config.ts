import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev only: proxy the API to a running scintled, carrying its token.
const home = process.env['SCINTLE_HOME'] ?? join(homedir(), '.local', 'share', 'scintle');
const read = (f: string): string => { try { return readFileSync(join(home, f), 'utf8').trim(); } catch { return ''; } };
const port = (JSON.parse(read('server.json') || '{"port":4873}') as { port: number }).port;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': { target: `http://127.0.0.1:${port}`, headers: { 'x-scintle-token': read('token') } } },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 800 },
});
