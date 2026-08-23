import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const localPrivateData = {
  name: 'local-private-data',
  configureServer(server) {
    server.middlewares.use('/private-data', (req, res, next) => {
      const name = (req.url || '').split('?')[0].replace(/^\/+/, '');
      if (!['nodes.csv', 'links.csv'].includes(name)) return next();

      const path = resolve(process.cwd(), 'out', name);
      if (!existsSync(path)) return next();

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      createReadStream(path).pipe(res);
    });
  }
};

export default defineConfig({
  root: 'site',
  base: './',
  plugins: [localPrivateData],
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
