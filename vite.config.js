import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';

// Serve the Vercel functions in /api during `npm run dev` too, with .env.local's
// server-side settings (DATABASE_URL…) available to them as on Vercel.
const devApi = {
  name: 'dev-api',
  configureServer(server) {
    Object.assign(process.env, loadEnv(server.config.mode, process.cwd(), ''));
    server.middlewares.use('/api', async (req, res, next) => {
      const name = req.url.split('?')[0].replace(/^\/+|\/+$/g, '');
      if (!/^[a-z][a-z0-9-]*$/.test(name)) return next(); // files starting with _ are helpers, not routes
      req.url = `/api${req.url}`; // connect strips the mount path
      try {
        const { default: handler } = await server.ssrLoadModule(`/api/${name}.js`);
        await handler(req, res);
      } catch (err) {
        if (err.code === 'ERR_LOAD_URL' || /Failed to load url/.test(err.message)) return next();
        res.statusCode = 500;
        res.end(String(err.message));
      }
    });
  },
};

// Dev-only: POST a data URL to /__save-preview?name=x to write public/previews/x.jpg
// (used once to capture the style preview images on the landing page).
const savePreview = {
  name: 'save-preview',
  configureServer(server) {
    server.middlewares.use('/__save-preview', async (req, res) => {
      const name = new URL(req.url, 'http://x').searchParams.get('name').replace(/[^a-z0-9-]/g, '');
      let body = '';
      for await (const chunk of req) body += chunk;
      const { mkdirSync, writeFileSync } = await import('node:fs');
      mkdirSync('public/previews', { recursive: true });
      writeFileSync(`public/previews/${name}.jpg`, Buffer.from(body.split(',')[1], 'base64'));
      res.end('saved');
    });
  },
};

export default defineConfig({
  plugins: [devApi, savePreview],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        studio: resolve(import.meta.dirname, 'studio.html'),
        embed: resolve(import.meta.dirname, 'embed.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
      },
    },
  },
});
